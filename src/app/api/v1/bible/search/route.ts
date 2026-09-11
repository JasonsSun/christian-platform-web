import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError, num } from '@/server/http';
import { bookById } from '@/server/bible';
import { cacheGetOrSet } from '@/server/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/bible/search?q=爱&version=cuv
 *  LIKE '%kw%' 无法走普通索引(9.3 万行全表扫描),靠结果缓存摊薄:
 *  热门关键词第二次起零数据库开销。 */
const SEARCH_TTL_MS = 120_000;

/** GET /api/v1/bible/search?q=爱&version=cuv */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const version = sp.get('version') || 'cuv';
  const limit = Math.min(num(sp.get('limit'), 30), 100);
  if (!keyword) throw new HttpError(400, 'BAD_REQUEST', '请输入搜索关键词');

  const key = `bible:search:${version}:${limit}:${keyword}`;
  const items = await cacheGetOrSet<any[]>(key, SEARCH_TTL_MS, () =>
    q<{ version: string; book_id: string; chapter: number; verse: number; text: string }>(
      `SELECT version, book_id, chapter, verse, text FROM bible_verses
       WHERE version = ? AND text LIKE ? ORDER BY book_id, chapter, verse LIMIT ?`,
      [version, `%${keyword}%`, limit]
    ).then((rows) =>
      rows.map((r) => ({
        version: r.version,
        bookId: r.book_id,
        bookName: bookById(r.book_id)?.name || r.book_id,
        chapter: r.chapter,
        verse: r.verse,
        text: r.text,
      }))
    )
  );

  return ok({ total: items.length, items });
});
