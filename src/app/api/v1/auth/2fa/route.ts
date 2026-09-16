import { NextRequest } from 'next/server';
import { ok, withApi, HttpError, readJson, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import {
  beginSetup,
  confirmSetup,
  disable,
  getStatus,
  regenerateRecovery,
} from '@/server/twoFactor';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

/** 当前 2FA 状态 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const status = await getStatus(user.id);
  return ok(status);
});

/**
 * 发起绑定 → 返回 secret 与 otpauth://（前端渲染成二维码）
 * 此时 confirmed 仍为 0，必须 POST 一次验证码才算真正开启。
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rl = await rateLimitAsync(`2fa-setup:${user.id}`, 10, 10 * 60_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试');

  const setup = await beginSetup(user.id, user.email || user.username);
  return ok(setup);
});

/** 确认绑定 / 关闭 / 重发恢复码，用 body.action 区分 */
export const PATCH = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rl = await rateLimitAsync(`2fa-act:${user.id}`, 20, 10 * 60_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试');

  const body = await readJson<{ action?: string; code?: string }>(req);
  const code = String(body.code || '').trim();

  if (body.action === 'confirm') {
    if (!code) throw new HttpError(422, 'VALIDATION_FAILED', '请输入 6 位验证码');
    try {
      const r = await confirmSetup(user.id, code);
      return ok({ confirmed: true, recoveryCodes: r.recoveryCodes });
    } catch (e: any) {
      throw new HttpError(400, 'CODE_INVALID', e?.message || '验证码不正确');
    }
  }

  if (body.action === 'disable') {
    if (!code) throw new HttpError(422, 'VALIDATION_FAILED', '请输入验证码或恢复码');
    const done = await disable(user.id, code);
    if (!done) throw new HttpError(400, 'CODE_INVALID', '验证码或恢复码不正确');
    return ok({ enabled: false });
  }

  if (body.action === 'recovery') {
    if (!code) throw new HttpError(422, 'VALIDATION_FAILED', '请输入当前验证码');
    const codes = await regenerateRecovery(user.id, code);
    if (!codes) throw new HttpError(400, 'CODE_INVALID', '验证码不正确');
    return ok({ recoveryCodes: codes });
  }

  throw new HttpError(422, 'VALIDATION_FAILED', '未知的 action');
});

export const OPTIONS = async () =>
  new Response(null, { status: 204, headers: { Allow: 'GET,POST,PATCH' } });

export const DELETE = withApi(async (req: NextRequest) => {
  // 语义同 PATCH action=disable，保留 DELETE 便于前端调用
  const user = await requireUser(req);
  const ip = clientIp(req);
  const rl = await rateLimitAsync(`2fa-del:${user.id}:${ip}`, 10, 10 * 60_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
  const body = await readJson<{ code?: string }>(req).catch(() => ({ code: '' }));
  const code = String(body?.code || '').trim();
  if (!code) throw new HttpError(422, 'VALIDATION_FAILED', '请输入验证码或恢复码');
  const done = await disable(user.id, code);
  if (!done) throw new HttpError(400, 'CODE_INVALID', '验证码或恢复码不正确');
  return ok({ enabled: false });
});
