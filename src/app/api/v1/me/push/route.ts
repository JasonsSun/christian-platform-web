import { NextRequest } from 'next/server';
import { ok, withApi, readJson, badRequest } from '@/server/http';
import { requireUser } from '@/server/auth';
import {
  pushConfigured,
  vapidPublicKey,
  saveSubscription,
  removeSubscription,
  countSubscriptions,
} from '@/server/webpush';

export const dynamic = 'force-dynamic';

/**
 * 浏览器推送订阅管理。
 *
 * 未配置 VAPID 时全部安全降级:GET 返回 configured=false 且订阅数 0,
 * 前端据此隐藏开关而不是报错。
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const enabled = pushConfigured();
  const r = ok({
    configured: enabled,
    publicKey: vapidPublicKey(),
    subscriptions: enabled ? await countSubscriptions(user.id) : 0,
  });
  r.headers.set('Cache-Control', 'no-store');
  return r;
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!pushConfigured()) throw badRequest('服务端未配置 VAPID 密钥，浏览器推送暂不可用');
  const body = await readJson<any>(req);
  const sub = body?.subscription;
  const saved = await saveSubscription(
    user.id,
    { endpoint: sub?.endpoint, keys: { p256dh: sub?.keys?.p256dh, auth: sub?.keys?.auth } },
    req.headers.get('user-agent') || ''
  );
  if (!saved) throw badRequest('订阅信息不完整');
  return ok({ ok: true, subscriptions: await countSubscriptions(user.id) });
});

/** 退订。不传 endpoint 表示解绑该用户的所有设备 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const endpoint = new URL(req.url).searchParams.get('endpoint') || undefined;
  await removeSubscription(user.id, endpoint);
  return ok({ ok: true, subscriptions: await countSubscriptions(user.id) });
});
