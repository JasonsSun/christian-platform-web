import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, startRoom, publicRoomView, LiveConflictError } from '@/server/live';
import { hlsPlayUrl, rtmpPushUrl } from '@/server/mediamtx';
import { q } from '@/server/db';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 开播:仅主播本人或管理员/审核员;且须审核通过、未取消、未过期 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  // 开播管理权限:仅主播本人或超管(不含审核员)
  const canManage = user.role === 'admin' || user.id === room.owner_id;
  if (!canManage) throw new HttpError(403, 'FORBIDDEN', '只有主播或管理员可以开播');

  if (room.status === 'ended') throw new HttpError(409, 'CONFLICT', '该直播间已结束,请新建一场');

  try {
    const { live } = await startRoom(room);
    await audit(user.id, 'LIVE_START', 'live', room.id, `开播:${room.title}`, clientIp(req));
    const fresh = await getRoom(id);
    // 推流字段仅超管/房主可见;审核员开播后亦不返回密钥
    const canSeeStream = user.role === 'admin' || user.id === room.owner_id;
    return ok(publicRoomView(fresh || room, canSeeStream, { hlsUrl: hlsPlayUrl(room.stream_key), rtmpUrl: rtmpPushUrl(room.stream_key), live }));
  } catch (e) {
    if (e instanceof LiveConflictError) throw new HttpError(409, 'LIVE_BLOCKED', e.message);
    throw e;
  }
});
