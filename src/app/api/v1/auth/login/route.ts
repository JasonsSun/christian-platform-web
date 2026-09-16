import { NextRequest } from 'next/server';
import { ok, readJson, withApi, clientIp, HttpError } from '@/server/http';
import {
  checkPassword, createSession, findUserByIdentifier, publicUser, signAccessToken,
  signTwoFactorTicket,
} from '@/server/auth';
import { audit } from '@/server/services';
import { verifyCaptcha, isBlocked, recordFailure, resetAttempts } from '@/server/captcha';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  // 限流：同一 IP 连续失败过多则拒绝
  if (isBlocked(ip)) throw new HttpError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请稍后再试');

  const body = await readJson<{ identifier?: string; password?: string; captchaId?: string; captchaCode?: string }>(req);
  const identifier = (body.identifier || '').trim();
  const password = body.password || '';
  if (!identifier || !password) throw new HttpError(400, 'BAD_REQUEST', '请输入账号与密码');

  // 验证码校验（一次性）
  if (!verifyCaptcha(body.captchaId, body.captchaCode)) {
    recordFailure(ip);
    throw new HttpError(422, 'CAPTCHA_INVALID', '验证码错误或已过期');
  }

  const user = await findUserByIdentifier(identifier);
  if (!user || !checkPassword(password, user.password_hash)) {
    await audit(user?.id || null, 'LOGIN_FAILURE', 'user', user?.id || '', `登录失败:${identifier}`, ip);
    recordFailure(ip); // 撞库防护：凭证错误也计入失败次数
    throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  }
  if (user.status !== 'active') throw new HttpError(403, 'ACCOUNT_DISABLED', '账号已被停用');

  resetAttempts(ip); // 成功则重置失败计数
  const session = await createSession(user.id, req);

  // 开了 2FA 时不直接发令牌：先给一张 5 分钟的中间票据，
  // 校验通过动态码后再换正式 token（见 /auth/2fa/verify）
  const { getStatus } = await import('@/server/twoFactor');
  const st = await getStatus(user.id).catch(() => null);
  if (st?.enabled) {
    return ok({
      require2fa: true,
      ticket: signTwoFactorTicket(user.id, session.sessionId),
      // 提示前端展示方式，不泄露是否配置了恢复码之外的信息
      hint: '请输入验证器 App 中的 6 位动态码',
    });
  }

  await audit(user.id, 'LOGIN_SUCCESS', 'user', user.id, `登录成功`, ip);

  return ok({
    user: publicUser(user),
    accessToken: signAccessToken(user, session.sessionId),
    refreshToken: session.refresh,
    expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
  });
});
