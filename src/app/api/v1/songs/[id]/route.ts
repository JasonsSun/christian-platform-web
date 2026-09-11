import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { mapSong } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const SELECT = `
  SELECT id, title, author, category, tags, lyrics, audio_url, audio_type, audio_credit,
         listen_url, listen_source, play_count,
         DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
  FROM songs WHERE id = ?`;

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const row = await one<any>(SELECT, [ctx.params.id]);
  if (!row) throw notFound('诗歌不存在');
  const related = await q<any>(
    `SELECT id, title, author, category FROM songs WHERE category = ? AND id <> ? LIMIT 5`,
    [row.category, row.id]
  );
  return ok({
    ...mapSong(row),
    related: related.map((r) => ({ id: r.id, title: r.title, author: r.author })),
  });
});

/** 播放一次:计数 +1 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const row = await one<any>(SELECT, [ctx.params.id]);
  if (!row) throw notFound('诗歌不存在');
  await exec(`UPDATE songs SET play_count = play_count + 1 WHERE id = ?`, [ctx.params.id]);
  return ok({ id: row.id, playCount: Number(row.play_count) + 1 });
});
