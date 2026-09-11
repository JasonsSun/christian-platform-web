import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { publicUrlFor } from '@/server/media';

export const dynamic = 'force-dynamic';

/** GET /api/v1/live/recordings -> 公开直播回放列表(已结束且已生成录像成品) */
export const GET = withApi(async (req: NextRequest) => {
  const rows = await q<any>(
    `SELECT r.id AS room_id, r.title, r.description, r.cover_url, r.owner_id, r.viewer_peak,
            r.recording_media_id, m.kind, m.duration_sec, m.storage_key, m.poster_key, m.play_count,
            DATE_FORMAT(r.started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,
            DATE_FORMAT(r.ended_at,'%Y-%m-%dT%H:%i:%sZ') AS ended_at
     FROM live_rooms r
     JOIN media_files m ON m.id = r.recording_media_id
     WHERE r.status = 'ended' AND r.recording_media_id IS NOT NULL AND m.status = 'ready'
     ORDER BY r.ended_at DESC LIMIT 50`
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
    url: row.storage_key ? publicUrlFor(row.storage_key) : '',
    posterUrl: row.poster_key ? publicUrlFor(row.poster_key) : '',
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }));
  return ok({ items });
});
