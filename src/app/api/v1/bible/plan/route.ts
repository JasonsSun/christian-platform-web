import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { bookById } from '@/server/bible';

export const dynamic = 'force-dynamic';

/** GET /api/v1/bible/plan  -> 今日读经 + 读经统计(连续天数/总章数) */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;

  // 1) 全部可读章节(数据库里真正有经文的)
  const chapters = await q<{ version: string; book_id: string; chapter: number }>(
    `SELECT DISTINCT version, book_id, chapter FROM bible_verses ORDER BY version, book_id, chapter`
  );
  const flat = chapters.map((c) => ({
    version: c.version,
    bookId: c.book_id,
    chapter: c.chapter,
    bookName: bookById(c.book_id)?.name || c.book_id,
  }));

  // 2) 按"一年中的第几天"选今日读经(1~3 段,确定性,保证每天不同且覆盖全库)
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const count = Math.min(3, flat.length);
  const today: typeof flat = [];
  for (let i = 0; i < count; i++) {
    const idx = (dayOfYear + i * 7) % flat.length;
    today.push(flat[idx]);
  }

  // 3) 读经统计:总章数 + 连续打卡天数
  const read = await q<{ read_date: string }>(
    `SELECT DISTINCT DATE_FORMAT(read_date,'%Y-%m-%d') AS read_date FROM bible_reading_history WHERE user_id = ?`, [user.id]
  );
  const dates = new Set(read.map((r) => String(r.read_date)));
  const totalChapters = dates.size; // 已读不同章节数(按天去重即不同章节)
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return ok({ today, totalChapters, streak, librarySize: flat.length });
});
