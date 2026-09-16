import { NextRequest } from 'next/server';
import { ok, withApi, HttpError, readJson, clientIp } from '@/server/http';
import { verify, publicUser, signAccessToken, findUserById } from '@/server/auth';
import { one } from '@/server/db';
import { verifyForLogin } from '@/server/twoFactor';
import { rateLimitAsync } from '@/server/ratelimit';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 用 2FA 票据 + 动态码（或恢复码）兑换正式令牌。
 *
 * 安全：
 * - 票据必须 typ='2fa' 且未过期，拿 access/refresh token 来这里一律拒绝。
 * - 同一用户 5 分钟内最多试 10 次，防爆破（6 位码空间只有 100 万）。
 * - 校验通过即撤掉票据（一次性），并复用票据里带的 sessionId 续接会话。
 */
export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  const body = await readJson<{ ticket?: string; code?: string }>(req);
  const ticket = String(body.ticket || '').trim();
  const code = String(body.code || '').trim();
  if (!ticket || !code) throw new HttpError(422, 'VALIDATION_FAILED', '缺少票据或验证码');

  let payload: any;
  try {
    payload = verify(ticket);
  } catch {
    throw new HttpError(401, 'INVALID_TICKET', '登录已超时，请重新登录');
  }
  if (payload.typ !== '2fa') throw new HttpError(401, 'INVALID_TICKET', '票据类型不正确');

  const [userId, sessionId] = String(payload.sub).split(':');
  if (!userId || !sessionId) throw new HttpError(401, 'INVALID_TICKET', '票据内容异常');

  const rl = await rateLimitAsync(`2fa-verify:${userId}`, 10, 5 * 60_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '尝试次数过多，请稍后再试');

  const user = await findUserById(userId);
  if (!user || user.status !== 'active') {
    throw new HttpError(403, 'ACCOUNT_DISABLED', '账号不可用');
  }

  const okCode = await verifyForLogin(userId, code);
  if (!okCode) {
    await audit(userId, 'LOGIN_2FA_FAILURE', 'user', userId, '2FA 验证码错误', ip);
    throw new HttpError(401, 'CODE_INVALID', '验证码或恢复码不正确');
  }

  // 会话是密码验证通过时已建好的，这里直接复用
  const sess = await one<{ refresh_hash: string }>(
    `SELECT refresh_hash FROM sessions WHERE id=? AND user_id=? AND revoked=0 LIMIT 1`,
    [sessionId, userId]
  );
  if (!sess) throw new HttpError(401, 'INVALID_TICKET', '会话已失效，请重新登录');

  await audit(userId, 'LOGIN_SUCCESS', 'user', userId, '登录成功（2FA）', ip);

  return ok({
    user: publicUser(user),
    // 票据一次性：签发的新 access token 带 sid，后续请求正常识别
    accessToken: signAccessToken(user, sessionId),
    // refresh token 已在 createSession 时下发，前端沿用登录第一步拿到的那张
    expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
  });
});
