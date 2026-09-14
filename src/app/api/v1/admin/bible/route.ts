import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';
import { BOOKS } from '@/server/bible';

export const dynamic = 'force-dynamic';

/** 书卷标准章数（按数据库 book_id 匹配），用于检测收录是否缺章 */
const STD_CHAPTERS = new Map<string, number>(BOOKS.map((b) => [b.dbId, b.chapters]));

/** 圣经管理:版本 / 书卷 / 章节 / 经文统计 + 数据体检 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);

  const byVersion = await q<any>(
    `SELECT version, COUNT(*) AS verse_count, COUNT(DISTINCT book_id) AS book_count,
            COUNT(DISTINCT CONCAT(book_id,'-',chapter)) AS chapter_count
     FROM bible_verses GROUP BY version ORDER BY verse_count DESC`
  );
  const byBook = await q<any>(
    `SELECT book_id, version, COUNT(*) AS verse_count, MAX(chapter) AS max_chapter,
            COUNT(DISTINCT chapter) AS chapter_count,
            GROUP_CONCAT(DISTINCT chapter ORDER BY chapter) AS chapters
     FROM bible_verses GROUP BY book_id, version ORDER BY book_id`
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM bible_verses`);
  const preview = await q<any>(
    `SELECT version, book_id, chapter, verse, text FROM bible_verses ORDER BY book_id, chapter, verse LIMIT 12`
  );
  // 数据体检:空/极短经文、异常超长经文（DB 上限 1000）
  const issues = await q<any>(
    `SELECT
       SUM(CASE WHEN CHAR_LENGTH(TRIM(text)) < 2 THEN 1 ELSE 0 END) AS empty_text,
       SUM(CASE WHEN CHAR_LENGTH(text) > 500 THEN 1 ELSE 0 END) AS long_text
     FROM bible_verses`
  );

  return ok({
    totals: {
      versions: byVersion.length,
      books: new Set(byBook.map((b) => b.book_id)).size,
      verses: Number(total[0]?.c || 0),
    },
    byVersion: byVersion.map((v) => ({
      version: v.version, verseCount: Number(v.verse_count),
      bookCount: Number(v.book_count), chapterCount: Number(v.chapter_count),
    })),
    byBook: byBook.map((b) => {
      const actual = Number(b.chapter_count);
      const std = STD_CHAPTERS.get(String(b.book_id));
      return {
        bookId: String(b.book_id), version: b.version, verseCount: Number(b.verse_count),
        maxChapter: Number(b.max_chapter), chapters: String(b.chapters || '').split(',').map(Number),
        stdChapters: std ?? null,
        missing: std != null ? Math.max(0, std - actual) : null,
      };
    }),
    preview: preview.map((p) => ({
      version: p.version, bookId: String(p.book_id), chapter: Number(p.chapter),
      verse: Number(p.verse), text: p.text,
    })),
    issues: {
      emptyText: Number(issues[0]?.empty_text || 0),
      longText: Number(issues[0]?.long_text || 0),
    },
  });
});
