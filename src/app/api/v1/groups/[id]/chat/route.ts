import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, readJson } from '@/server/http';
import { requireUser } from '@/server/auth';
import {
  isGroupMember,
  addGroupMessage,
  listGroupMessages,
} from '@/server/groupChat';
import { broadcastChat } from '@/server/realtime';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function shape(m: any) {
  return {
    id: m.id,
    groupId: m.group_id,
    userId: m.user_id,
    content: m.content,
    createdAt: m.created_at,
    user: {
      id: m.user_id,
      displayName: m.display_name,
      username: m.username,
      avatarColor: m.avatar_color || '#4f6df5',
    },
  };
}

/** 群聊消息：成员可拉取；since 之后增量 */
export const GET = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  if (!(await isGroupMember(user.id, id))) throw new HttpError(403, 'FORBIDDEN', '仅团契成员可查看群聊');
  const sp = new URL(req.url).searchParams;
  const since = sp.get('since') || undefined;
  const messages = (await listGroupMessages(id, since)).map(shape);
  const last = messages.length ? messages[messages.length - 1].createdAt : undefined;
  return ok({ messages, last });
});

/** 发送群聊消息：成员可发；带频控防刷屏 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  if (!(await isGroupMember(user.id, id))) throw new HttpError(403, 'FORBIDDEN', '仅团契成员可发言');
  const rl = await rateLimitAsync(`group-chat:${user.id}`, 20, 10_000);
  if (!rl.ok) throw new HttpError(429, 'RATE_LIMITED', '发言过于频繁,请稍后再试');

  const b = await readJson<{ content?: string }>(req);
  const content = (b.content || '').trim();
  if (!content) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');
  if (content.length > 1000) throw new HttpError(422, 'VALIDATION_FAILED', '消息过长(≤1000字)');

  const row = await addGroupMessage(id, user.id, user.display_name, (user as any).avatar_color || null, content);
  const msg = shape(row);
  // 实时推送：同一房间的 WS 客户端立即收到（server.js 未启用时静默降级为轮询）
  broadcastChat(`group:${id}`, msg);
  return ok({ message: msg }, 201);
});
