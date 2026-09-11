import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError, readJson, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom, reviewRoom, publicRoomView } from '@/server/live';
import { hlsPlayUrl, rtmpPushUrl } from '@/server/mediamtx';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 审核直播间(通过/驳回):仅 admin/moderator;仅「待审且未取消、未起播」的房间可审 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  if (user.role !== 'admin' && user.role !== 'moderator') {
    throw new HttpError(403, 'FORBIDDEN', '只有管理员或审核员可以审核直播间');
  }
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  if (room.status !== 'created') throw new HttpError(409, 'CONFLICT', '该直播间已起播或结束,无法再审核');
  if (room.cancel_reason) throw new HttpError(409, 'CONFLICT', '该直播间已被取消');

  const b = await readJson<{ approve?: boolean; note?: string }>(req);
  // 显式校验:approve 必须为布尔值,缺失/类型错误一律 422,防止参数名打错被误判为"通过"
  if (typeof b.approve !== 'boolean') {
    throw new HttpError(422, 'VALIDATION_FAILED', '参数错误:approve 必须为 true(通过) 或 false(驳回)');
  }
  const updated = await reviewRoom(room, user.id, b.approve, b.note?.trim());
  await audit(user.id, b.approve ? 'LIVE_REVIEW_APPROVE' : 'LIVE_REVIEW_REJECT', 'live', room.id,
    `${b.approve ? '通过' : '驳回'}直播间:${room.title}${b.note?.trim() ? `(${b.note.trim()})` : ''}`, clientIp(req));

  // 审核通过:给房主发"允许直播"通知,点通知直达开播页(详情页控制台内已有开播指南引导)
  if (b.approve) {
    await notify(room.owner_id, 'live_approved', '✅ 直播审核通过,可以开播了',
      `「${room.title}」已通过审核。点此进入直播间开播页,按指南配置推流软件即可开始直播。`,
      `/live/${room.id}`);
  } else {
    await notify(room.owner_id, 'live_rejected', '⚠️ 直播审核未通过',
      b.note?.trim() ? `「${room.title}」未通过审核:${b.note.trim()}` : `「${room.title}」未通过审核,无法开播。`,
      `/live/${room.id}`);
  }

  return ok(publicRoomView(updated || room, true, { hlsUrl: hlsPlayUrl(room.stream_key), rtmpUrl: rtmpPushUrl(room.stream_key) }), 201);
});
