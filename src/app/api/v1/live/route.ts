import { NextRequest } from 'next/server';
import { ok, withApi, HttpError, readJson } from '@/server/http';
import { requireUser, requireRole } from '@/server/auth';
import { createRoom, listRooms, publicRoomView, countViewersBatch, listMessages, isRoomExpired } from '@/server/live';
import { listPathsLive, hlsPlayUrl } from '@/server/mediamtx';
import { ts, exec } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 列表:公开端只展示「已通过且未取消、未过期」的房间 + 直播中;
 *  管理端加 ?review=1 可见全部(含待审/驳回/取消,用于后台管理) */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req).catch(() => null);
  const sp = new URL(req.url).searchParams;
  const mine = sp.get('mine') === '1';
  const status = sp.get('status') || undefined;
  const staffList = sp.get('review') === '1';

  let rooms = await listRooms({ status });
  if (mine && user) rooms = rooms.filter((r) => r.owner_id === user.id);
  const isStaff = !!user && (user.role === 'admin' || user.role === 'moderator');

  let visible = rooms;
  if (!(isStaff && staffList)) {
    // 普通用户/公开端:房主本人的房间始终可见(哪怕待审/取消/过期);
    // 其余房间必须:已审核通过、未取消、未过期
    visible = rooms.filter((r) =>
      (!!user && r.owner_id === user.id)
      || (r.review_status === 'approved' && !r.cancel_reason && !isRoomExpired(r) && r.status !== 'ended')
    );
  }

  // 批量取流状态与在线人数:固定 2 次 I/O,不随房间数增长(原先每个房间 2 次)
  const liveIds = visible.filter((r) => r.status === 'live').map((r) => r.id);
  const [pathLive, viewers] = await Promise.all([
    liveIds.length ? listPathsLive() : Promise.resolve(new Map<string, boolean>()),
    countViewersBatch(liveIds),
  ]);

  const out = visible.map((r) => {
    const isLive = r.status === 'live';
    return publicRoomView(r, false, {
      hlsUrl: hlsPlayUrl(r.stream_key),
      viewerCount: isLive ? (viewers.get(r.id) || 0) : 0,
      live: isLive ? (pathLive.get(r.stream_key) ?? false) : false,
    });
  });
  return ok({ rooms: out });
});

/** 创建直播间:登录用户均可申请(进待审核);admin/moderator 创建免审 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const b = await readJson<{ title?: string; description?: string; coverUrl?: string; recordEnabled?: boolean; scheduledAt?: string; reviewVideoId?: string }>(req);
  if (!b.title || !b.title.trim()) throw new HttpError(422, 'VALIDATION_FAILED', '请填写直播标题');
  const isStaff = user.role === 'admin' || user.role === 'moderator';
  const room = await createRoom({
    ownerId: user.id,
    title: b.title.trim(),
    description: b.description?.trim() || undefined,
    coverUrl: b.coverUrl?.trim() || undefined,
    scheduledAt: b.scheduledAt?.trim() || undefined,
    reviewStatus: isStaff ? 'approved' : 'pending',
    reviewVideoId: b.reviewVideoId?.trim() || undefined,
  });
  // 主播可选择"保存录像":写入 record_enabled,直播结束后自动落入待审媒体库
  if (b.recordEnabled) {
    await exec(`UPDATE live_rooms SET record_enabled = 1, updated_at = ? WHERE id = ?`, [ts(), room.id]);
    (room as any).record_enabled = 1;
  }
  const canSeeStream = true; // 创建者即房主本人,可见自己的推流信息
  const view = publicRoomView(room, canSeeStream, { hlsUrl: hlsPlayUrl(room.stream_key) });
  return ok(view, 201);
});
