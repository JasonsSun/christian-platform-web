import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { normalizeAudioType } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/** 赞美诗管理:列表 + 分类统计 */
export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'songs');
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const tab = sp.get('tab') || 'all'; // all | pending
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(s.title LIKE ? OR s.author LIKE ? OR s.tags LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (tab === 'pending') { where.push("s.status = 'pending'"); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT s.id, s.title, s.author, s.category, s.tags, s.audio_url, s.audio_type, s.audio_credit,
            s.listen_url, s.listen_source, s.play_count, s.chords, s.original_key,
            s.source, s.status, s.submitter_id,
            u.display_name AS submitter_name,
            DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            (SELECT COUNT(*) FROM song_favorites f WHERE f.song_id = s.id) AS favorite_count,
            CHAR_LENGTH(s.lyrics) AS lyrics_len
     FROM songs s LEFT JOIN users u ON u.id = s.submitter_id
     ${whereSql}
     ORDER BY (s.status = 'pending') DESC, s.play_count DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM songs s ${whereSql}`, args);
  const byCategory = await q<any>(`SELECT category, COUNT(*) AS c FROM songs GROUP BY category ORDER BY c DESC`);
  const pendingCount = await one<any>(`SELECT COUNT(*) AS c FROM songs WHERE status = 'pending'`);
  const byAudioType = await q<any>(`SELECT audio_type, COUNT(*) AS c FROM songs GROUP BY audio_type`);
  return ok({
    items: rows.map((r) => ({
      id: r.id, title: r.title, author: r.author, category: r.category, tags: r.tags,
      hasAudio: !!r.audio_url, playCount: Number(r.play_count), favoriteCount: Number(r.favorite_count),
      lyricsLen: Number(r.lyrics_len), createdAt: r.created_at,
      audioType: normalizeAudioType(r.audio_type, r.audio_url), audioCredit: r.audio_credit || '',
      listenUrl: r.listen_url || '', listenSource: r.listen_source || '',
      chords: r.chords || '', originalKey: r.original_key || '',
      source: r.source, status: r.status, submitterName: r.submitter_name || '',
    })),
    total: Number(total?.c || 0), page, pageSize,
    pendingCount: Number(pendingCount?.c || 0),
    byCategory: byCategory.map((c) => ({ category: c.category, c: Number(c.c) })),
    byAudioType: byAudioType.map((a) => ({ audioType: a.audio_type, c: Number(a.c) })),
  });
});
