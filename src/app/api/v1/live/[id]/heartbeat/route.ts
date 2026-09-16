import { NextRequest } from 'next/server';
import { ok, withApi, notFound } from '@/server/http';
import { getRoom, heartbeat } from '@/server/live';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 在线人数心跳:观众上报在线状态,返回当前在线数;带 IP 频控,防伪造 session 高频刷库 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  const sp = new URL(req.url).searchParams;
  const session = sp.get('s') || Math.random().toString(36).slice(2);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  const rl = await rateLimitAsync(`beat:ip:${ip}`, 8, 10_000);
  if (!rl.ok) return ok({ viewerCount: 0, session, retryAfterMs: rl.retryAfterMs });
  const count = await heartbeat(room.id, session);
  return ok({ viewerCount: count, session });
});
