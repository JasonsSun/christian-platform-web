import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { mapSong, AUDIO_TYPES } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/**
 * 诗歌列表
 * @param audioType vocal=只要真人演唱 | instrumental=只要伴奏 | 不传=全部
 *                 另有 audioType=hasAudio 表示"有音频即可(人声优先排序)"
 */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const category = sp.get('category') || '';
  const audioType = (sp.get('audioType') || '').trim();
  const sort = sp.get('sort') || 'hot';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);

  const where: string[] = ['status = \'published\''];
  const args: any[] = [];
  if (keyword) { where.push('(title LIKE ? OR author LIKE ? OR tags LIKE ? OR lyrics LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (category) { where.push('category = ?'); args.push(category); }
  if ((AUDIO_TYPES as readonly string[]).includes(audioType)) {
    where.push('audio_type = ?'); args.push(audioType);
  } else if (audioType === 'hasAudio') {
    where.push("audio_type <> 'none'");
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // 真人演唱永远排在最前,其次按热度:让人声版本先被听到
  const orderBy = sort === 'new'
    ? "(audio_type = 'vocal') DESC, created_at DESC"
    : "(audio_type = 'vocal') DESC, play_count DESC, title ASC";

  const rows = await q<any>(
    `SELECT id, title, author, category, tags, lyrics, audio_url, audio_type, audio_credit,
            listen_url, listen_source, play_count,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM songs ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM songs ${whereSql}`, args);
  const categories = await q<any>(
    `SELECT category, COUNT(*) AS c FROM songs WHERE status = 'published' GROUP BY category ORDER BY c DESC`
  );
  const vocalCount = await one<any>(
    `SELECT COUNT(*) AS c FROM songs WHERE status = 'published' AND audio_type = 'vocal'`
  );
  return ok({
    items: rows.map(mapSong),
    total: Number(total?.c || 0),
    vocalCount: Number(vocalCount?.c || 0),
    page,
    pageSize,
    categories: categories.map((c) => ({ name: c.category, count: Number(c.c) })),
  });
});
