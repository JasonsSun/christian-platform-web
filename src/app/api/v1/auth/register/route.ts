import { NextRequest } from 'next/server';
import { exec, one, newId, ts } from '@/server/db';
import { ok, readJson, withApi, clientIp, HttpError } from '@/server/http';
import { createSession, findUserById, hashPassword, publicUser, signAccessToken } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { verifyCaptcha, isBlocked, recordFailure, resetAttempts } from '@/server/captcha';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  // 限流：同一 IP 连续失败过多则拒绝
  if (isBlocked(ip)) throw new HttpError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请稍后再试');

  const body = await readJson<{
    username?: string; email?: string; password?: string; displayName?: string; city?: string; church?: string;
    captchaId?: string; captchaCode?: string; inviteCode?: string;
  }>(req);

  // 验证码校验（一次性）
  if (!verifyCaptcha(body.captchaId, body.captchaCode)) {
    recordFailure(ip);
    throw new HttpError(422, 'CAPTCHA_INVALID', '验证码错误或已过期');
  }

  const username = (body.username || '').trim();
  const email = (body.email || '').trim();
  const password = body.password || '';
  const displayName = (body.displayName || username).trim();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new HttpError(400, 'BAD_REQUEST', '用户名需为 3-20 位字母数字下划线');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'BAD_REQUEST', '邮箱格式不正确');
  if (password.length < 6) throw new HttpError(400, 'BAD_REQUEST', '密码至少 6 位');

  const exists = await one<any>(`SELECT id FROM users WHERE username=? OR email=? LIMIT 1`, [username, email]);
  if (exists) {
    resetAttempts(ip); // 业务校验失败不代表是机器人，重置以免误伤
    throw new HttpError(409, 'USER_EXISTS', '用户名或邮箱已被注册');
  }

  const id = newId('usr');
  const colors = ['#4f6df5', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];
  await exec(
    `INSERT INTO users (id, username, email, password_hash, display_name, role, status, avatar_color, bio, city, region, church, created_at)
     VALUES (?,?,?,?,?,'member','active',?,?,?,?,?,?)`,
    [id, username, email, hashPassword(password), displayName,
     colors[Math.floor(Math.random() * colors.length)], '', body.city || '', 'CN', body.church || '', ts()]
  );

  const user = (await findUserById(id))!;
  resetAttempts(ip); // 成功则重置失败计数
  const session = await createSession(id, req);
  await audit(id, 'USER_REGISTER', 'user', id, `注册账号 ${username}`, clientIp(req));

  // 邀请关系：软失败，绝不因为邀请码有问题影响注册成功
  let invitedBy: string | null = null;
  try {
    const { redeemInvite } = await import('@/server/growth');
    const r = await redeemInvite(body.inviteCode, id);
    if (r.ok && r.inviterId) {
      invitedBy = r.inviterId;
      await audit(id, 'USER_INVITED', 'user', id, `由 ${invitedBy} 邀请注册`, clientIp(req));
      await notify(invitedBy, 'invite_joined', '你的好友已加入', `${displayName} 通过你的邀请链接加入了社区，成长奖励已到账。`, `/users/${id}`);
    }
  } catch {
    /* 忽略：邀请只是加成 */
  }

  await notify(id, 'welcome', '欢迎加入圣约社区', `${displayName}，欢迎你！去完善资料、读经、加入团契吧。`, '/me');

  return ok(
    {
      user: publicUser(user),
      accessToken: signAccessToken(user),
      refreshToken: session.refresh,
      expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
    },
    201
  );
});
