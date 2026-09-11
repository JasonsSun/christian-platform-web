import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { mapSong } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/songs/favorites  -> 我收藏的诗歌 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const rows = await q<any>(
    `SELECT s.id, s.title, s.author, s.category, s.tags, s.lyrics, s.audio_url,
            s.audio_type, s.audio_credit, s.listen_url, s.listen_source, s.play_count,
            DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM song_favorites f JOIN songs s ON s.id = f.song_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`, [user.id]
  );
  return ok({ items: rows.map(mapSong) });
});
