import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requestPasswordReset } from '@/server/passwordReset';
import { clientIp } from '@/server/http';
import { audit } from '@/server/services';
import { one } from '@/server/db';
import { rateLimit } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * 申请密码重置邮件。
 *
 * 安全：无论邮箱是否存在都返回相同响应（防用户枚举）；
 * 同一 IP 有独立限流，避免被拿来当邮件轰炸机。
 */
export const POST = withApi(async (req: NextRequest) => {
  const ip = clientIp(req);
  const rl = rateLimit(`forgot:${ip}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    throw new HttpError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim();

  // 不校验邮箱格式到"是否存在"，但空值/明显非法直接拒，减少无谓查询
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '请输入有效的邮箱地址');
  }

  try {
    await requestPasswordReset(email, ip);
  } catch (e: any) {
    const code = e?.code;
    if (code === 'SMTP_NOT_CONFIGURED') {
      throw new HttpError(503, 'SMTP_NOT_CONFIGURED', '邮件服务未配置，请联系管理员重置密码');
    }
    if (code === 'RATE_LIMITED') {
      throw new HttpError(429, 'RATE_LIMITED', e.message);
    }
    throw e;
  }

  // 审计只记录"有人申请过"，不记录邮箱是否命中
  const u = await one<{ id: string }>(`SELECT id FROM users WHERE LOWER(email)=? LIMIT 1`, [
    email.toLowerCase(),
  ]);
  if (u) await audit(u.id, 'PASSWORD_RESET_REQUEST', 'user', u.id, '申请密码重置邮件', ip);

  return ok({ sent: true });
});
