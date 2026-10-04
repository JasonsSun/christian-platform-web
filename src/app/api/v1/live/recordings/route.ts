import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { publicUrlFor } from '@/server/media';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/live/recordings -> 直播回放列表
 *
 * 可见性规则(与直播详情页一致):
 *  - review_status='approved'      → 对所有人公开
 *  - review_status='pending'       → 仅主播本人与管理员可见(审核通过前主播可自看)
 *  - review_status='rejected'      → 任何人不可见(审核驳回时录像已被物理清理)
 * 旧实现没有按 review_status 过滤,未审核的回放会出现在公开列表里,
 * 点进去却撞「该文件尚未通过审核」403 —— 列表与详情两套口径。
 */
export const GET = withApi(async (req: NextRequest) => {
  // 可选登录(不强制):匿名只看已通过审核的
  const user = await requireUser(req).catch(() => null);
  const isStaff = !!user && (user.role === 'admin' || user.role === 'moderator');

  const rows = await q<any>(
    `SELECT r.id AS room_id, r.title, r.description, r.cover_url, r.owner_id, r.viewer_peak,
            r.recording_media_id, m.kind, m.duration_sec, m.storage_key, m.poster_key, m.play_count,
            m.review_status,
            DATE_FORMAT(r.started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,
            DATE_FORMAT(r.ended_at,'%Y-%m-%dT%H:%i:%sZ') AS ended_at
     FROM live_rooms r
     JOIN media_files m ON m.id = r.recording_media_id
     WHERE r.status = 'ended' AND r.recording_media_id IS NOT NULL
       AND m.status = 'ready' AND m.review_status <> 'rejected'
       AND (m.review_status = 'approved' OR ? = 1 OR r.owner_id = ?)
     ORDER BY r.ended_at DESC LIMIT 50`,
    [isStaff ? 1 : 0, user?.id || '']
  );
  const items = rows.map((row: any) => ({
    roomId: row.room_id,
    title: row.title,
    description: row.description || '',
    coverUrl: row.cover_url || '',
    ownerId: row.owner_id,
    viewerPeak: Number(row.viewer_peak || 0),
    mediaId: row.recording_media_id,
    kind: row.kind,
    durationSec: Number(row.duration_sec || 0),
    playCount: Number(row.play_count || 0),
    reviewStatus: row.review_status,
    url: row.storage_key ? publicUrlFor(row.storage_key) : '',
    posterUrl: row.poster_key ? publicUrlFor(row.poster_key) : '',
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }));
  return ok({ items });
});
