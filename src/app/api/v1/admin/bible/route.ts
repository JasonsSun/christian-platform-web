import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** 圣经管理:版本 / 书卷 / 章节 / 经文统计 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);

  const byVersion = await q<any>(
    `SELECT version, COUNT(*) AS verse_count, COUNT(DISTINCT book_id) AS book_count,
            COUNT(DISTINCT CONCAT(book_id,'-',chapter)) AS chapter_count
     FROM bible_verses GROUP BY version ORDER BY verse_count DESC`
  );
  const byBook = await q<any>(
    `SELECT book_id, version, COUNT(*) AS verse_count, MAX(chapter) AS max_chapter,
            GROUP_CONCAT(DISTINCT chapter ORDER BY chapter) AS chapters
     FROM bible_verses GROUP BY book_id, version ORDER BY book_id`
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM bible_verses`);
  const preview = await q<any>(
    `SELECT version, book_id, chapter, verse, text FROM bible_verses ORDER BY book_id, chapter, verse LIMIT 12`
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
    byBook: byBook.map((b) => ({
      bookId: String(b.book_id), version: b.version, verseCount: Number(b.verse_count),
      maxChapter: Number(b.max_chapter), chapters: String(b.chapters || '').split(',').map(Number),
    })),
    preview: preview.map((p) => ({
      version: p.version, bookId: String(p.book_id), chapter: Number(p.chapter),
      verse: Number(p.verse), text: p.text,
    })),
  });
});
