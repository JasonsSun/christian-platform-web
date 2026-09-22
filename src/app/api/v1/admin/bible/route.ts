import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';
import { BOOKS } from '@/server/bible';
import { cacheGetOrSet } from '@/server/cache';

export const dynamic = 'force-dynamic';

/** 书卷标准章数（按数据库 book_id 匹配），用于检测收录是否缺章 */
const STD_CHAPTERS = new Map<string, number>(BOOKS.map((b) => [b.dbId, b.chapters]));

/** 统计缓存键：单节经文修订后要在 verse/route 里按 'admin:bible:' 前缀清掉，否则体检数字会停留在旧文本上 */
const BIBLE_STATS_KEY = 'admin:bible:stats';

/** 93k 行的全表聚合，读一次要 190ms，而唯一会动它的只有单节修订 */
const STATS_TTL_MS = 5 * 60 * 1000;

async function collectStats() {
  // 体检要逐行读 text，是四条里最慢的一条；和聚合互不依赖，并行跑掉等待
  const [rows, issues] = await Promise.all([
    // 一次 (version, book) 聚合同时供三个口径：(书卷,章) 天然按书卷互斥，
    // 所以「各书卷去重章数相加」就等于原来单独跑的 COUNT(DISTINCT book||chapter)，
    // 版本级的经文数/书卷数 likewise，不必再为它们各扫一遍全表。
    q<any>(
      `SELECT version, book_id, COUNT(*) AS verse_count, COUNT(DISTINCT chapter) AS chapter_count,
              MAX(chapter) AS max_chapter,
              GROUP_CONCAT(DISTINCT chapter ORDER BY chapter) AS chapters
       FROM bible_verses GROUP BY version, book_id`
    ),
    // 数据体检:空/极短经文、异常超长经文（DB 上限 1000）
    q<any>(
      `SELECT
         SUM(CASE WHEN CHAR_LENGTH(TRIM(text)) < 2 THEN 1 ELSE 0 END) AS empty_text,
         SUM(CASE WHEN CHAR_LENGTH(text) > 500 THEN 1 ELSE 0 END) AS long_text
       FROM bible_verses`
    ),
  ]);

  const byVersionMap = new Map<string, { verses: number; books: number; chapters: number }>();
  for (const r of rows) {
    const cur = byVersionMap.get(r.version) || { verses: 0, books: 0, chapters: 0 };
    cur.verses += Number(r.verse_count);
    cur.books += 1;
    cur.chapters += Number(r.chapter_count);
    byVersionMap.set(r.version, cur);
  }

  return {
    totals: {
      versions: byVersionMap.size,
      books: new Set(rows.map((r) => String(r.book_id))).size,
      verses: rows.reduce((s, r) => s + Number(r.verse_count), 0),
    },
    byVersion: [...byVersionMap].map(([version, v]) => ({
      version,
      verseCount: v.verses,
      bookCount: v.books,
      chapterCount: v.chapters,
    })).sort((a, b) => b.verseCount - a.verseCount),
    byBook: rows.map((b) => {
      const actual = Number(b.chapter_count);
      const std = STD_CHAPTERS.get(String(b.book_id));
      return {
        bookId: String(b.book_id), version: b.version, verseCount: Number(b.verse_count),
        maxChapter: Number(b.max_chapter), chapters: String(b.chapters || '').split(',').map(Number),
        stdChapters: std ?? null,
        missing: std != null ? Math.max(0, std - actual) : null,
      };
    }),
    issues: {
      emptyText: Number(issues[0]?.empty_text || 0),
      longText: Number(issues[0]?.long_text || 0),
    },
  };
}

/** 圣经管理:版本 / 书卷 / 章节统计 + 数据体检 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  return ok(await cacheGetOrSet(BIBLE_STATS_KEY, STATS_TTL_MS, collectStats));
});
