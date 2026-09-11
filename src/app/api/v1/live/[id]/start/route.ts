import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, startRoom, publicRoomView, LiveConflictError } from '@/server/live';
import { hlsPlayUrl, rtmpPushUrl } from '@/server/mediamtx';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 开播:仅主播本人或管理员/审核员;且须审核通过、未取消、未过期 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  const isStaffOrOwner = user.role === 'admin' || user.role === 'moderator' || user.id === room.owner_id;
  if (!isStaffOrOwner) throw new HttpError(403, 'FORBIDDEN', '只有主播或管理员可以开播');

  if (room.status === 'ended') throw new HttpError(409, 'CONFLICT', '该直播间已结束,请新建一场');

  try {
    const { live } = await startRoom(room);
    await audit(user.id, 'LIVE_START', 'live', room.id, `开播:${room.title}`, clientIp(req));
    const fresh = await getRoom(id);
    return ok(publicRoomView(fresh || room, true, { hlsUrl: hlsPlayUrl(room.stream_key), rtmpUrl: rtmpPushUrl(room.stream_key), live }));
  } catch (e) {
    if (e instanceof LiveConflictError) throw new HttpError(409, 'LIVE_BLOCKED', e.message);
    throw e;
  }
});
