import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/v1/songs/{id}/favorite  -> 切换收藏 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const songId = ctx.params.id;
  const song = await one<any>(`SELECT id FROM songs WHERE id = ?`, [songId]);
  if (!song) throw notFound('诗歌不存在');
  const existing = await one<any>(
    `SELECT id FROM song_favorites WHERE user_id = ? AND song_id = ?`, [user.id, songId]
  );
  if (existing) {
    await exec(`DELETE FROM song_favorites WHERE id = ?`, [existing.id]);
    return ok({ favorited: false });
  }
  const { newId, ts } = await import('@/server/db');
  await exec(
    `INSERT INTO song_favorites (id, user_id, song_id, created_at) VALUES (?,?,?,?)`,
    [newId('fav'), user.id, songId, ts()]
  );
  return ok({ favorited: true });
});
