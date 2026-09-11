import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { one, q, exec, newId, ts } from './db';
import { HttpError, unauthorized, forbidden } from './http';

const SECRET = process.env.JWT_SECRET || 'change-me-in-production-change-me-in-production';
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL || 900);
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL || 2592000);
const ISSUER = 'christian-platform';

export type UserRow = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: 'member' | 'moderator' | 'admin';
  status: string;
  avatar_color: string;
  bio: string;
  city: string;
  region: string;
  church: string;
  created_at: string;
};

export type JwtPayload = { sub: string; role: string; typ: 'access' | 'refresh'; exp: number; iss: string };

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function sign(payload: Omit<JwtPayload, 'iss'>): string {
  const body = { ...payload, iss: ISSUER };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

export function verify(token: string): JwtPayload {
  const [head, data, sig] = token.split('.');
  if (!head || !data || !sig) throw new HttpError(401, 'INVALID_TOKEN', '令牌格式错误');
  const expect = crypto.createHmac('sha256', SECRET).update(`${head}.${data}`).digest('base64url');
  if (expect !== sig) throw new HttpError(401, 'INVALID_TOKEN', '签名校验失败');
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as JwtPayload;
  if (payload.exp * 1000 < Date.now()) throw new HttpError(401, 'TOKEN_EXPIRED', '令牌已过期');
  return payload;
}

export function signAccessToken(user: { id: string; role: string }) {
  return sign({ sub: user.id, role: user.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + ACCESS_TTL });
}

export function signRefreshToken(userId: string, sessionId: string) {
  return sign({ sub: `${userId}:${sessionId}`, role: 'refresh', typ: 'refresh', exp: Math.floor(Date.now() / 1000) + REFRESH_TTL });
}

export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);
export const checkPassword = (p: string, hash: string) => bcrypt.compareSync(p, hash);

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** 建立会话并返回 refresh token(刷新令牌哈希入库,明文只返回一次) */
export async function createSession(userId: string, req: Request) {
  const sessionId = newId('ses');
  const refresh = signRefreshToken(userId, sessionId);
  const expires = new Date(Date.now() + REFRESH_TTL * 1000);
  await exec(
    `INSERT INTO sessions (id, user_id, refresh_hash, user_agent, ip, expires_at, revoked, created_at)
     VALUES (?,?,?,?,?,?,0,?)`,
    [sessionId, userId, sha256(refresh), (req.headers.get('user-agent') || '').slice(0, 255), '', ts(expires), ts()]
  );
  return { refresh, sessionId, expires };
}

/** 刷新轮换:旧 token 立即失效;若旧 token 已被撤销 => 重放攻击,撤销整条会话链 */
export async function rotateSession(refresh: string) {
  const payload = verify(refresh);
  if (payload.typ !== 'refresh') throw new HttpError(401, 'INVALID_TOKEN', '非刷新令牌');
  const [userId, sessionId] = String(payload.sub).split(':');
  const session = await one<any>(
    `SELECT * FROM sessions WHERE id=? AND user_id=?`, [sessionId, userId]
  );
  if (!session) throw unauthorized('会话不存在');
  if (session.revoked) {
    await exec(`UPDATE sessions SET revoked=1 WHERE user_id=?`, [userId]);
    throw new HttpError(401, 'TOKEN_REPLAYED', '刷新令牌已被使用过,已撤销全部会话');
  }
  if (session.refresh_hash !== sha256(refresh)) throw unauthorized('刷新令牌不匹配');

  await exec(`UPDATE sessions SET revoked=1 WHERE id=?`, [sessionId]);

  const newSessionId = newId('ses');
  const newRefresh = signRefreshToken(userId, newSessionId);
  const expires = new Date(Date.now() + REFRESH_TTL * 1000);
  await exec(
    `INSERT INTO sessions (id, user_id, refresh_hash, user_agent, ip, expires_at, revoked, rotated_from, created_at)
     VALUES (?,?,?,?,?,?,0,?,?)`,
    [newSessionId, userId, sha256(newRefresh), session.user_agent || '', session.ip || '', ts(expires), sessionId, ts()]
  );
  const user = await findUserById(userId);
  if (!user) throw unauthorized('用户不存在');
  return { user, refresh: newRefresh, access: signAccessToken(user), sessionId: newSessionId };
}

export async function revokeSession(refresh: string | null) {
  if (!refresh) return;
  try {
    const payload = verify(refresh);
    const [userId, sessionId] = String(payload.sub).split(':');
    await exec(`UPDATE sessions SET revoked=1 WHERE id=? AND user_id=?`, [sessionId, userId]);
  } catch {
    /* 忽略无效 token */
  }
}

export async function findUserById(id: string) {
  return one<UserRow>(`SELECT * FROM users WHERE id=?`, [id]);
}

export async function findUserByIdentifier(identifier: string) {
  return one<UserRow & { password_hash: string }>(
    `SELECT * FROM users WHERE username=? OR email=? LIMIT 1`, [identifier, identifier]
  );
}

function tokenFrom(req: NextRequest | Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function currentUser(req: NextRequest | Request): Promise<UserRow | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  try {
    const payload = verify(token);
    if (payload.typ !== 'access') return null;
    const user = await findUserById(payload.sub);
    if (!user || user.status !== 'active') return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest | Request): Promise<UserRow> {
  const user = await currentUser(req);
  if (!user) throw unauthorized();
  return user;
}

export async function requireRole(req: NextRequest | Request, roles: string[]): Promise<UserRow> {
  const user = await requireUser(req);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, 'FORBIDDEN', `需要以下角色之一:${roles.join('/')}`);
  }
  return user;
}

/** 对外输出的用户对象(不含敏感字段) */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    avatarColor: u.avatar_color,
    bio: u.bio,
    city: u.city,
    region: u.region,
    church: u.church,
    createdAt: u.created_at,
  };
}

export async function userStats(userId: string) {
  const [contentCount] = await q<any>(
    `SELECT COUNT(*) c FROM contents WHERE author_id=? AND status='published'`, [userId]);
  const [followers] = await q<any>(`SELECT COUNT(*) c FROM follows WHERE followee_id=?`, [userId]);
  const [following] = await q<any>(`SELECT COUNT(*) c FROM follows WHERE follower_id=?`, [userId]);
  const [activities] = await q<any>(
    `SELECT COUNT(*) c FROM activity_registrations WHERE user_id=? AND status!='cancelled'`, [userId]);
  return {
    contents: Number(contentCount.c),
    followers: Number(followers.c),
    following: Number(following.c),
    activities: Number(activities.c),
  };
}

export const ACCESS_TTL_SECONDS = ACCESS_TTL;
