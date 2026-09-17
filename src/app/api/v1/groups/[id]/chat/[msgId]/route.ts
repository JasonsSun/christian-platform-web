import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { deleteGroupMessage } from '@/server/groupChat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 删除群消息：作者本人或团长 */
export const DELETE = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const msgId = ctx.params.msgId as string;
  const user = await requireUser(req);
  const r = await deleteGroupMessage(id, msgId, user.id);
  if (r === 'not_found') throw notFound('消息不存在');
  if (r === 'forbidden') throw new HttpError(403, 'FORBIDDEN', '只有发布者或团长可以删除该消息');
  return ok({ ok: true });
});
