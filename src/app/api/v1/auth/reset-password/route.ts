import { NextRequest } from 'next/server';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { resetPasswordWithToken, verifyResetToken } from '@/server/passwordReset';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

/** 校验链接是否仍有效（前端进入 /reset 页时先探一次，避免让用户白填密码） */
export const GET = withApi(async (req: NextRequest) => {
  const token = new URL(req.url).searchParams.get('token') || '';
  const valid = await verifyResetToken(token);
  return ok({ valid });
});

/** 用令牌设置新密码 */
export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  const rl = await rateLimitAsync(`reset:${ip}`, 10, 10 * 60 * 1000);
  if (!rl.ok) {
    throw new HttpError(429, 'RATE_LIMITED', '尝试过于频繁，请稍后再试');
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  const password = String(body.password || '');

  if (!token) throw new HttpError(422, 'VALIDATION_FAILED', '缺少重置令牌');
  if (password.length < 6) throw new HttpError(422, 'VALIDATION_FAILED', '新密码至少 6 位');

  try {
    await resetPasswordWithToken(token, password);
  } catch (e: any) {
    throw new HttpError(400, 'RESET_FAILED', e?.message || '重置失败，请重新申请');
  }

  return ok({ reset: true, reloginRequired: true });
});
