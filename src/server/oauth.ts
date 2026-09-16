import crypto from 'crypto';
import { exec, newId, one, ts } from './db';
import { hashPassword, createSession, signAccessToken } from './auth';
import { packSecret } from './secret';

/**
 * 通用第三方登录（OAuth2 授权码流程，配置驱动）。
 *
 * 环境变量（每个 provider 一个 key，例如 google / github）：
 *   OAUTH_PROVIDERS=google,github
 *   OAUTH_GOOGLE_NAME=Google
 *   OAUTH_GOOGLE_CLIENT_ID=...
 *   OAUTH_GOOGLE_CLIENT_SECRET=...
 *   OAUTH_GOOGLE_AUTHORIZE_URL=https://accounts.google.com/o/oauth2/v2/auth
 *   OAUTH_GOOGLE_TOKEN_URL=https://oauth2.googleapis.com/token
 *   OAUTH_GOOGLE_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo
 *   OAUTH_GOOGLE_SCOPE=openid email profile
 *   OAUTH_GOOGLE_REDIRECT_URI=https://your.domain/api/v1/auth/oauth/callback
 *   # 可选字段映射（不同 provider 字段名不同）
 *   OAUTH_GOOGLE_ID_FIELD=sub
 *   OAUTH_GOOGLE_EMAIL_FIELD=email
 *   OAUTH_GOOGLE_NAME_FIELD=name
 *   OAUTH_GOOGLE_PICTURE_FIELD=picture
 *
 * 流程：前端 /auth/oauth/start?provider=google 拿到授权 URL 并跳转 ->
 *       provider 回跳 /auth/oauth/callback?code=&state= ->
 *       服务端换 token、取用户信息、绑定/注册、签发本站令牌，通过
 *       postMessage 把令牌交给 opener 并关闭窗口。
 */

export interface OAuthProvider {
  key: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  redirectUri: string;
  idField: string;
  emailField: string;
  nameField: string;
  pictureField: string;
}

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export function listProviders(): { key: string; name: string }[] {
  const raw = process.env.OAUTH_PROVIDERS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key) => {
      const name = process.env[`OAUTH_${key.toUpperCase()}_NAME`] || key;
      return { key, name };
    });
}

export function getProviderConfig(key: string): OAuthProvider | null {
  const k = key.toUpperCase();
  const clientId = process.env[`OAUTH_${k}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${k}_CLIENT_SECRET`];
  const authorizeUrl = process.env[`OAUTH_${k}_AUTHORIZE_URL`];
  const tokenUrl = process.env[`OAUTH_${k}_TOKEN_URL`];
  const userInfoUrl = process.env[`OAUTH_${k}_USERINFO_URL`];
  const redirectUri = process.env[`OAUTH_${k}_REDIRECT_URI`];
  if (!clientId || !clientSecret || !authorizeUrl || !tokenUrl || !userInfoUrl) return null;
  return {
    key,
    name: process.env[`OAUTH_${k}_NAME`] || key,
    clientId,
    clientSecret,
    authorizeUrl,
    tokenUrl,
    userInfoUrl,
    scope: process.env[`OAUTH_${k}_SCOPE`] || 'openid email profile',
    redirectUri: redirectUri || '',
    idField: process.env[`OAUTH_${k}_ID_FIELD`] || 'sub',
    emailField: process.env[`OAUTH_${k}_EMAIL_FIELD`] || 'email',
    nameField: process.env[`OAUTH_${k}_NAME_FIELD`] || 'name',
    pictureField: process.env[`OAUTH_${k}_PICTURE_FIELD`] || 'picture',
  };
}

export function buildAuthorizeUrl(cfg: OAuthProvider, state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  });
  return `${cfg.authorizeUrl}?${p.toString()}`;
}

async function exchangeCode(cfg: OAuthProvider, code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const text = await res.text();
  const json = safeJson(text) as any;
  if (!res.ok || !json?.access_token) {
    throw new Error(`OAuth 令牌交换失败 ${res.status}: ${text.slice(0, 200)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : undefined,
  };
}

async function fetchProfile(cfg: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  const json = safeJson(text) as any;
  if (!res.ok) throw new Error(`OAuth 取用户信息失败 ${res.status}: ${text.slice(0, 200)}`);
  const pick = (f: string) => (json?.[f] ?? null);
  const providerUserId = String(pick(cfg.idField) ?? pick('id') ?? '').trim();
  if (!providerUserId) throw new Error('OAuth 响应缺少用户唯一标识');
  return {
    providerUserId,
    email: pick(cfg.emailField) ? String(pick(cfg.emailField)) : null,
    name: pick(cfg.nameField) ? String(pick(cfg.nameField)) : null,
    picture: pick(cfg.pictureField) ? String(pick(cfg.pictureField)) : null,
  };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // 部分 provider 返回 form-urlencoded
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(text).entries()) out[k] = v;
    return out;
  }
}

async function avatarColor(): Promise<string> {
  const palette = ['#4f6df5', '#e2674a', '#3aa675', '#b564d6', '#d6a23a', '#2f9bbf', '#d65a8a'];
  return palette[Math.floor(Math.random() * palette.length)];
}

async function resolveUser(cfg: OAuthProvider, profile: OAuthProfile): Promise<{ userId: string; isNew: boolean }> {
  // 1) 已绑定的第三方身份
  const linked = await one<{ user_id: string }>(
    `SELECT user_id FROM user_oauth WHERE provider=? AND provider_user_id=?`,
    [cfg.key, profile.providerUserId]
  );
  if (linked) return { userId: linked.user_id, isNew: false };

  // 2) 同邮箱已存在本站账号 -> 直接关联
  if (profile.email) {
    const existing = await one<{ id: string }>(`SELECT id FROM users WHERE email=?`, [profile.email]);
    if (existing) {
      await linkOAuth(existing.id, cfg, profile);
      return { userId: existing.id, isNew: false };
    }
  }

  // 3) 新建账号
  const id = newId('usr');
  const baseName = (profile.name || profile.email || `${cfg.key}用户`).replace(/[^一-龥a-zA-Z0-9_ ]/g, '').trim().slice(0, 40) || '用户';
  let username = (profile.email?.split('@')[0] || `user${id.slice(0, 6)}`).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 40);
  if (!username) username = `user${id.slice(0, 8)}`;
  username = await uniqueUsername(username);
  const email = profile.email || `${cfg.key}_${profile.providerUserId}@oauth.local`;
  const color = await avatarColor();
  await exec(
    `INSERT INTO users (id, username, email, password_hash, display_name, role, status, avatar_color, created_at)
     VALUES (?,?,?,?,'member','active',?,?,?)`,
    [id, username, email, hashPassword(crypto.randomUUID()), baseName, color, ts()]
  );
  await linkOAuth(id, cfg, profile);
  return { userId: id, isNew: true };
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const hit = await one<any>(`SELECT id FROM users WHERE username=?`, [candidate]);
    if (!hit) return candidate;
    candidate = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  return `${base}${crypto.randomUUID().slice(0, 8)}`;
}

async function linkOAuth(userId: string, cfg: OAuthProvider, profile: OAuthProfile): Promise<void> {
  await exec(
    `INSERT INTO user_oauth (id, user_id, provider, provider_user_id, provider_email, display_name, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE provider_email=VALUES(provider_email), display_name=VALUES(display_name), updated_at=VALUES(updated_at)`,
    [newId('oau'), userId, cfg.key, profile.providerUserId, profile.email, profile.name, ts(), ts()]
  );
}

/** 完整回调处理：换 token -> 取资料 -> 绑定/注册 -> 建会话。返回本站令牌。 */
export async function handleOAuthCallback(
  cfg: OAuthProvider,
  code: string,
  req: Request
): Promise<{ user: any; accessToken: string; refreshToken: string; isNew: boolean }> {
  const { accessToken, refreshToken, expiresIn } = await exchangeCode(cfg, code);
  const profile = await fetchProfile(cfg, accessToken);
  const { userId, isNew } = await resolveUser(cfg, profile);

  const user = await one<any>(`SELECT * FROM users WHERE id=?`, [userId]);
  if (!user || user.status !== 'active') throw new Error('账号不可用');

  // 存令牌（加密），便于将来刷新
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
  await exec(
    `UPDATE user_oauth SET access_token=?, refresh_token=?, expires_at=?, updated_at=?
     WHERE provider=? AND provider_user_id=?`,
    [
      accessToken ? packSecret(accessToken) : null,
      refreshToken ? packSecret(refreshToken) : null,
      expiresAt,
      ts(),
      cfg.key,
      profile.providerUserId,
    ]
  );

  const session = await createSession(user.id, req);
  return {
    user,
    accessToken: signAccessToken(user, session.sessionId),
    refreshToken: session.refresh,
    isNew,
  };
}
