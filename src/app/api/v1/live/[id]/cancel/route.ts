import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, readJson, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, cancelRoom, endRoom, publicRoomView, LiveConflictError } from '@/server/live';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 取消直播间:
 *  - 预告(created)状态:创建人可取消自己的;admin/moderator 可取消任意;
 *  - 直播中(live):仅 admin/moderator 可强制取消(先结束再标记取消);创建人须在 live 中走 end 路由自己结束。
 *  取消不删除数据,标记 cancel_reason,公开列表不再展示。 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');

  // 取消/强制关闭权限:仅创建人本人或超管(moderator 仅能看开播指南,不参与管理)
  const isAdmin = user.role === 'admin';
  const isOwner = user.id === room.owner_id;
  if (!isAdmin && !isOwner) throw new HttpError(403, 'FORBIDDEN', '只有创建人本人或管理员可以取消直播间');

  const b = await readJson<{ reason?: string }>(req);
  const reason = (b.reason || '').trim();

  // 直播中:创建人无权强制取消,只有管理员可以(结束 + 标记取消)
  if (room.status === 'live' && !isAdmin) {
    throw new HttpError(403, 'FORBIDDEN', '直播正在进行,只有管理员可以强制关闭');
  }

  try {
    let updated;
    if (room.status === 'live') {
      // 管理员强制关闭:先 end,再标记取消
      await endRoom(room);
      updated = await getRoom(id);
      if (!updated) throw notFound('直播间不存在');
      updated = await cancelRoom(updated, reason || '管理员强制关闭并取消');
    } else {
      updated = await cancelRoom(room, reason);
    }
    await audit(user.id, 'LIVE_CANCEL', 'live', room.id,
      `取消直播间:${room.title}${reason ? `(${reason})` : ''}${room.status === 'live' ? '[强制]' : ''}`, clientIp(req));
    // 推流字段仅对超管/房主可见
    return ok(publicRoomView(updated || room, isAdmin || isOwner));
  } catch (e) {
    if (e instanceof LiveConflictError) throw new HttpError(409, 'LIVE_BLOCKED', e.message);
    throw e;
  }
});
