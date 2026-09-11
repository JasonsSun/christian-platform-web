import crypto from 'crypto';
import { q, one, exec, ts, newId } from './db';
import { cacheGetOrSet } from './cache';
import { registerPath, removePath, isPathLive, rtmpPushUrl } from './mediamtx';
import { finalizeLiveRecording } from './liveRecord';

export interface LiveRoomRow {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  stream_key: string;
  publish_secret: string;
  owner_id: string;
  status: 'created' | 'live' | 'ended';
  review_status: 'pending' | 'approved' | 'rejected';
  review_note: string;
  review_video_id: string | null;
  reviewed_by: string | null;
  scheduled_at: string | null;
  cancel_reason: string;
  started_at: string | null;
  ended_at: string | null;
  viewer_peak: number;
  record_enabled: number | null;       // 0 | 1
  recording_media_id: string | null;
  created_at: string;
  updated_at: string;
}

function rand(len: number): string {
  return crypto.randomBytes(len).toString('hex');
}

/** 约定开播时间过期判定:过了 scheduled_at + 24h 宽限仍未起播即视为过期(只读,不影响数据) */
export function isRoomExpired(room: Pick<LiveRoomRow, 'status' | 'scheduled_at'>): boolean {
  if (room.status !== 'created' || !room.scheduled_at) return false;
  const limit = new Date(room.scheduled_at).getTime() + 24 * 60 * 60 * 1000;
  return Date.now() > limit;
}

/** 创建直播间。
 *  - admin/moderator 创建:免审(review_status='approved'),可直接开播;
 *  - 普通用户创建:进入待审(review_status='pending'),须经 admin/mod 通过后才可开播。
 */
export async function createRoom(opts: {
  ownerId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  scheduledAt?: string;      // ISO/本地时间串,写入前转 UTC
  reviewStatus?: 'pending' | 'approved';
  reviewVideoId?: string;    // 普通用户申请开播时提交的现场视频审核材料(media_files.id)
}): Promise<LiveRoomRow | null> {
  const id = newId('live');
  const streamKey = rand(9);
  const publishSecret = rand(12);
  const scheduledUtc = opts.scheduledAt ? ts(new Date(opts.scheduledAt)) : null;
  await exec(
    `INSERT INTO live_rooms (id, title, description, cover_url, stream_key, publish_secret, owner_id, status, review_status, review_video_id, scheduled_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, 'created', ?, ?, ?, ?, ?)`,
    [id, opts.title, opts.description || null, opts.coverUrl || null, streamKey, publishSecret, opts.ownerId, opts.reviewStatus || 'pending', opts.reviewVideoId || null, scheduledUtc, ts(), ts()]
  );
  return getRoom(id);
}

export async function getRoom(id: string): Promise<LiveRoomRow | null> {
  // 短 TTL 缓存:直播间状态变更(开播/结束)最多 2s 后才在列表/详情生效,
  // 前端在 start/end 后会主动 reload 补偿,不影响体验,但能大幅削减热点房间的重复读。
  return cacheGetOrSet(`live:room:${id}`, 2000, () =>
    one<LiveRoomRow>(`SELECT * FROM live_rooms WHERE id = ?`, [id])
  );
}

/** 列表:后台/管理可见全部;公开仅返回 live/created 中可展示的 */
export async function listRooms(opts: { onlyPublic?: boolean; ownerId?: string; status?: string; reviewStatus?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (opts.ownerId) { where.push('owner_id = ?'); params.push(opts.ownerId); }
  if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  if (opts.reviewStatus) { where.push('review_status = ?'); params.push(opts.reviewStatus); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return cacheGetOrSet(`live:list:${JSON.stringify(opts)}`, 3000, () =>
    q<LiveRoomRow>(
      `SELECT * FROM live_rooms ${w} ORDER BY
         (status='live') DESC, (status='created') DESC, started_at DESC, created_at DESC`,
      params
    )
  );
}

/** 起播:注册媒体服务器路径 + 置为 live。
 *  前置校验:审核必须已通过、未取消、未过期 —— 任一不满足抛 HttpError,防止"瞎播"。 */
export async function startRoom(room: LiveRoomRow): Promise<{ live: boolean }> {
  if (room.cancel_reason) throw new LiveConflictError('该直播间已被取消,无法开播');
  if (room.review_status === 'pending') throw new LiveConflictError('直播间审核中,请等待管理员通过后再开播');
  if (room.review_status === 'rejected') throw new LiveConflictError('直播间未通过审核,无法开播');
  if (isRoomExpired(room)) throw new LiveConflictError('已过约定直播时间,该直播间已过期,无法开播');
  const okReg = await registerPath(room.stream_key);
  await exec(`UPDATE live_rooms SET status='live', started_at=?, updated_at=? WHERE id=?`, [ts(), ts(), room.id]);
  return { live: okReg };
}

/** 结束:移除媒体服务器路径 + 置为 ended;若主播申请了录像,触发录像编排(异步,不阻塞) */
export async function endRoom(room: LiveRoomRow): Promise<void> {
  await removePath(room.stream_key);
  await exec(`UPDATE live_rooms SET status='ended', ended_at=?, updated_at=? WHERE id=?`, [ts(), ts(), room.id]);
  // 录像编排:不 await,失败不阻断结束流程
  if (room.record_enabled) {
    finalizeLiveRecording(room).catch((e) =>
      console.error(`[live] finalizeLiveRecording failed: room=${room.id}`, e)
    );
  }
}

/** 内部错误类型(不依赖 http.ts,避免 server 层耦合;路由层会转成 HttpError 409) */
export class LiveConflictError extends Error {
  constructor(msg: string) { super(msg); this.name = 'LiveConflictError'; }
}

/** 审核直播间:仅 pending 状态可审 */
export async function reviewRoom(room: LiveRoomRow, reviewerId: string, approve: boolean, note?: string): Promise<LiveRoomRow | null> {
  await exec(
    `UPDATE live_rooms SET review_status=?, review_note=?, reviewed_by=?, updated_at=? WHERE id=?`,
    [approve ? 'approved' : 'rejected', (note || '').trim().slice(0, 250), reviewerId, ts(), room.id]
  );
  return getRoom(room.id);
}

/** 取消直播间(仅预告状态;live 中须走 endRoom 强制关闭)。
 *  创建人可取消自己的预告;管理员可取消任意直播间。取消不删除数据,标记 cancel_reason。 */
export async function cancelRoom(room: LiveRoomRow, reason: string): Promise<LiveRoomRow | null> {
  if (room.status === 'live') throw new LiveConflictError('直播正在进行,请先强制结束再取消');
  if (room.status === 'ended') throw new LiveConflictError('该直播间已结束');
  const rsn = (reason || '已取消').trim().slice(0, 250);
  await exec(
    `UPDATE live_rooms SET cancel_reason=?, updated_at=? WHERE id=?`,
    [rsn, ts(), room.id]
  );
  return getRoom(room.id);
}

/** 真实在线人数(30 秒内心跳);加 3s 缓存,避免每个观众轮询都打 COUNT */
export async function countViewers(roomId: string): Promise<number> {
  return cacheGetOrSet(`live:vc:${roomId}`, 3000, async () => {
    const r = await one<{ c: number }>(
      // 注意:ts() 写入的是 UTC,而 NOW() 返回 MySQL 会话本地时间(东八区),
      // 直接比较会导致 30 秒窗口永远不匹配、在线人数恒为 0。故统一用 UTC_TIMESTAMP() 比较。
      `SELECT COUNT(*) AS c FROM live_viewers WHERE room_id = ? AND last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND)`,
      [roomId]
    );
    return Number(r?.c || 0);
  });
}

/** 批量统计多个房间的在线人数(一次 GROUP BY,替代列表页对每个房间各查一次) */
export async function countViewersBatch(roomIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!roomIds.length) return out;
  const rows = await q<{ room_id: string; c: number }>(
    `SELECT room_id, COUNT(*) AS c FROM live_viewers
      WHERE room_id IN (${roomIds.map(() => '?').join(',')})
        AND last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND)
      GROUP BY room_id`,
    roomIds
  );
  for (const r of rows) out.set(r.room_id, Number(r.c));
  return out;
}

/** 心跳:更新在线状态,刷新峰值 */
export async function heartbeat(roomId: string, session: string): Promise<number> {
  await exec(
    `INSERT INTO live_viewers (room_id, session, last_seen) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE last_seen = ?`,
    [roomId, session, ts(), ts()]
  );
  const cnt = await countViewers(roomId);
  const room = await getRoom(roomId);
  if (room && cnt > room.viewer_peak) {
    await exec(`UPDATE live_rooms SET viewer_peak = ? WHERE id = ?`, [cnt, roomId]);
  }
  return cnt;
}

/* ---------------- 聊天 ---------------- */

export async function addMessage(roomId: string, userId: string | null, displayName: string, avatarColor: string | null, content: string) {
  const id = newId('lm');
  await exec(
    `INSERT INTO live_messages (id, room_id, user_id, display_name, avatar_color, content, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, roomId, userId, displayName, avatarColor, content, ts()]
  );
  return one<any>(`SELECT * FROM live_messages WHERE id = ?`, [id]);
}

export async function listMessages(roomId: string, since?: string, limit = 200) {
  const params: any[] = [roomId];
  let extra = '';
  if (since) { extra = ' AND created_at > ?'; params.push(since); }
  params.push(limit);
  return await q<any>(
    `SELECT * FROM live_messages WHERE room_id = ?${extra} ORDER BY created_at ASC LIMIT ?`,
    params
  );
}

/* ---------------- 对外视图 ---------------- */

export function publicRoomView(room: LiveRoomRow, isStaffOrOwner: boolean, extra: {
  owner?: any; hlsUrl?: string; rtmpUrl?: string; viewerCount?: number; messages?: any[]; live?: boolean;
} = {}) {
  const expired = isRoomExpired(room);
  const base: any = {
    id: room.id,
    title: room.title,
    description: room.description,
    coverUrl: room.cover_url,
    status: room.status,
    reviewStatus: room.review_status,
    reviewNote: room.review_note || null,
    reviewVideoId: room.review_video_id || null,
    scheduledAt: room.scheduled_at || null,
    cancelled: !!room.cancel_reason,
    cancelReason: room.cancel_reason || null,
    expired,
    startedAt: room.started_at,
    endedAt: room.ended_at,
    viewerPeak: room.viewer_peak,
    recordEnabled: !!room.record_enabled,
    recordingMediaId: room.recording_media_id || null,
    owner: extra.owner,
    viewerCount: extra.viewerCount ?? 0,
    messages: extra.messages ?? [],
    live: extra.live ?? room.status === 'live',
    hlsUrl: extra.hlsUrl,
  };
  if (isStaffOrOwner) {
    base.streamKey = room.stream_key;
    base.publishSecret = room.publish_secret;
    base.rtmpUrl = extra.rtmpUrl ?? rtmpPushUrl(room.stream_key);
  }
  return base;
}
