import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { BOOKS, VERSIONS } from '@/server/bible';

export const dynamic = 'force-dynamic';

// 数据库 book_id（dbId 缩写，如 Gen）-> 前端书卷 id（如 genesis）
const DB_ID_TO_BOOK_ID = new Map<string, string>(
  BOOKS.map((b) => [b.dbId, b.id])
);

/** GET /api/v1/bible  ->  译本 + 书卷 + 已收录章节 */
export const GET = withApi(async () => {
  const rows = await q<{ version: string; book_id: string; chapter: number }>(
    `SELECT version, book_id, chapter FROM bible_verses GROUP BY version, book_id, chapter ORDER BY chapter`
  );
  const available: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    // 把 dbId 映射成前端书卷 id；未知的保留原值
    const bookId = DB_ID_TO_BOOK_ID.get(r.book_id) || r.book_id;
    available[r.version] = available[r.version] || {};
    available[r.version][bookId] = available[r.version][bookId] || [];
    available[r.version][bookId].push(r.chapter);
  }
  return ok({ versions: VERSIONS, books: BOOKS, available });
});
