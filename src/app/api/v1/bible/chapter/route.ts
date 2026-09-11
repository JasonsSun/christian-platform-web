import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError, notFound } from '@/server/http';
import { bookById, toDbBookId } from '@/server/bible';
import { cacheGetOrSet } from '@/server/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/bible/chapter?version=cuv&book=john&chapter=1
 *  经文是静态数据,长 TTL 缓存:同一章第二次起零数据库开销。 */
const CHAPTER_TTL_MS = 3600_000;

/** GET /api/v1/bible/chapter?version=cuv&book=john&chapter=1 */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const version = sp.get('version') || 'cuv';
  const bookId = sp.get('book') || 'john';
  const chapter = Number(sp.get('chapter') || 1);
  if (!Number.isFinite(chapter) || chapter < 1) throw new HttpError(422, 'VALIDATION_FAILED', '章节无效');

  const book = bookById(bookId);
  if (!book) throw notFound('书卷不存在');

  // 使用 dbId 查询数据库
  const dbBookId = book.dbId || toDbBookId(bookId) || bookId;

  const key = `bible:chapter:${version}:${dbBookId}:${chapter}`;
  return ok(await cacheGetOrSet(key, CHAPTER_TTL_MS, async () => {
    const rows = await q<{ verse: number; text: string }>(
      `SELECT verse, text FROM bible_verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse`,
      [version, dbBookId, chapter]
    );

    const chapters = await q<{ chapter: number }>(
      `SELECT DISTINCT chapter FROM bible_verses WHERE version = ? AND book_id = ? ORDER BY chapter`,
      [version, dbBookId]
    );

    return {
      version,
      book: { id: book.id, name: book.name, abbr: book.abbr, chapters: book.chapters, testament: book.testament },
      chapter,
      verses: rows,
      availableChapters: chapters.map((c) => c.chapter),
      hasContent: rows.length > 0,
    };
  }));
});
