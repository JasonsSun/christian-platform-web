import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, notFound, clientIp } from '@/server/http';
import { mapSong } from '@/server/mappers';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const SELECT = `
  SELECT id, title, author, category, tags, lyrics, audio_url, audio_type, audio_credit,
         listen_url, listen_source, play_count, chords, original_key,
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

/**
 * 播放一次:计数 +1
 *
 * 这是全项目唯一"匿名 + 无写权限校验"的计数写入口，未登录也能调，
 * 因此必须防刷，否则一个循环脚本就能把任意诗歌的播放量刷到任意数字。
 * 两层保护：
 * 1) 同一 IP 对同一首歌 30s 内只计一次 —— 挡住自动刷新/单曲狂刷；
 * 2) 同一 IP 每分钟最多 60 次 —— 挡住遍历所有歌曲批量刷。
 *
 * 超限时不报错，返回当前计数但不再自增：播放计数不是关键业务，
 * 报错反而会让前端出现无意义的失败态。
 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const songId = ctx.params.id;
  const ip = clientIp(req);

  const perIp = await rateLimitAsync(`play:ip:${ip}`, 60, 60_000);
  if (!perIp.ok) {
    const cur = await one<{ play_count: number }>(`SELECT play_count FROM songs WHERE id = ?`, [songId]);
    return ok({ id: songId, playCount: Number(cur?.play_count || 0), counted: false });
  }

  const perSong = await rateLimitAsync(`play:song:${ip}:${songId}`, 1, 30_000);
  const row = await one<any>(SELECT, [songId]);
  if (!row) throw notFound('诗歌不存在');

  if (!perSong.ok) {
    // 30s 内重复请求（刷新页面、重播），不重复计数
    return ok({ id: row.id, playCount: Number(row.play_count), counted: false });
  }

  await exec(`UPDATE songs SET play_count = play_count + 1 WHERE id = ?`, [songId]);
  return ok({ id: row.id, playCount: Number(row.play_count) + 1, counted: true });
});
