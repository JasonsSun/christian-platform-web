import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, readJson } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, addMessage, listMessages, countViewers } from '@/server/live';
import { broadcastChat } from '@/server/realtime';
import { rateLimitAsync } from '@/server/ratelimit';
import { notifyRole } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 直播聊天:轮询拉取(since 之后);不传则取最近 200 条;附带实时在线人数(走缓存,近乎零成本) */
export const GET = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  const sp = new URL(req.url).searchParams;
  const since = sp.get('since') || undefined;
  const messages = await listMessages(room.id, since);
  const viewerCount = await countViewers(room.id);
  return ok({ messages, viewerCount });
});

/** 发送聊天(需登录);带频控(每用户 10s 内最多 10 条)防刷屏打爆库 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const rl = await rateLimitAsync(`chat:${user.id}`, 10, 10_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '发言过于频繁，请稍后再试');
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  if (room.status === 'ended') throw new HttpError(409, 'CONFLICT', '直播已结束，聊天室已关闭');

  const b = await readJson<{ content?: string }>(req);
  const content = (b.content || '').trim();
  if (!content) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');
  if (content.length > 500) throw new HttpError(422, 'VALIDATION_FAILED', '消息过长(≤500字)');

  const msg = await addMessage(room.id, user.id, user.display_name, (user as any).avatar_color || null, content);
  return ok({ message: msg }, 201);
});
