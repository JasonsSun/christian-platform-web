import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, endRoom } from '@/server/live';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 结束直播:主播本人或管理员/审核员(管理员可强制关闭他人正在进行的直播) */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  const isStaffOrOwner = user.role === 'admin' || user.role === 'moderator' || user.id === room.owner_id;
  if (!isStaffOrOwner) throw new HttpError(403, 'FORBIDDEN', '只有主播或管理员可以结束直播');
  if (room.status === 'ended') throw new HttpError(409, 'CONFLICT', '该直播间已结束');

  await endRoom(room);
  const isStaff = user.role === 'admin' || user.role === 'moderator';
  const who = isStaff && user.id !== room.owner_id ? '(管理员强制关闭) ' : '';
  await audit(user.id, 'LIVE_END', 'live', room.id, `结束直播：${who}${room.title}`, clientIp(req));
  const fresh = await getRoom(id);
  return ok({ id: room.id, status: 'ended' });
});
