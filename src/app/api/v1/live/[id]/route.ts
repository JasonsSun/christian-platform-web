import { NextRequest } from 'next/server';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser, findUserById } from '@/server/auth';
import { getRoom, publicRoomView, countViewers, listMessages } from '@/server/live';
import { isPathLive, hlsPlayUrl, rtmpPushUrl } from '@/server/mediamtx';
import { getRecordingReviewStatus } from '@/server/liveRecord';
import { q } from '@/server/db';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 直播间详情:公开可见 HLS 播放地址与聊天;主播/管理员额外可见推流地址与密钥 */
export const GET = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');

  const user = await requireUser(req).catch(() => null);
  // 主播本人 + 超管可见推流信息;审核员(moderator)不含在内(仅能看开播指南)
  const canSeeStream = !!user && (user.role === 'admin' || user.id === room.owner_id);

  const live = room.status === 'live' ? await isPathLive(room.stream_key) : false;
  const vc = room.status === 'live' ? await countViewers(room.id) : 0;
  const messages = await listMessages(room.id);
  const owner = await findUserById(room.owner_id).catch(() => null);
  // 当前登录用户是否预约了该直播(用于详情页"预约/取消预约"按钮状态)
  const reminded = !!user && !!(await q<{ c: number }>(
    `SELECT 1 AS c FROM live_reminders WHERE room_id=? AND user_id=? LIMIT 1`,
    [id, user.id]
  )).length;
  const reminderCount = Number((await q<{ c: number }>(`SELECT COUNT(*) AS c FROM live_reminders WHERE room_id=?`, [id]))[0]?.c || 0);

  const view = publicRoomView(room, canSeeStream, {
    hlsUrl: hlsPlayUrl(room.stream_key),
    rtmpUrl: rtmpPushUrl(room.stream_key),
    viewerCount: vc,
    messages,
    live,
    owner: owner ? { id: owner.id, displayName: owner.display_name, avatarColor: whiteSafeColor(owner.avatar_color) } : undefined,
    recordingReviewStatus: await getRecordingReviewStatus(room.recording_media_id),
  });
  return ok({ ...view, reminded, reminderCount });
});
