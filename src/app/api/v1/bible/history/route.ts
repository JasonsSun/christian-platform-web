import { NextRequest } from 'next/server';
import { exec, q, newId, ts } from '@/server/db';
import { ok, withApi, badRequest } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { bookById } from '@/server/bible';

export const dynamic = 'force-dynamic';

/** GET /api/v1/bible/history  -> 最近读经记录 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const rows = await q<any>(
    `SELECT version, book_id, chapter, DATE_FORMAT(read_date,'%Y-%m-%d') AS read_date,
            DATE_FORMAT(read_at,'%Y-%m-%dT%H:%i:%sZ') AS read_at
     FROM bible_reading_history WHERE user_id = ? ORDER BY read_at DESC LIMIT 30`,
    [user.id]
  );
  return ok({
    items: rows.map((r) => ({
      version: r.version, bookId: r.book_id, chapter: r.chapter,
      readDate: r.read_date, readAt: r.read_at,
      bookName: bookById(r.book_id)?.name || r.book_id,
    })),
  });
});

/** POST /api/v1/bible/history  body:{version?,bookId,chapter,recordPlan?}  -> 记录已读(同日同章不重复) */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const b = await (await import('@/server/http')).readJson<{
    version?: string;
    bookId: string;
    chapter: number;
    recordPlan?: boolean;
  }>(req);
  if (!b.bookId || !b.chapter) throw badRequest('缺少书卷或章节');
  const version = b.version || 'cuv';
  const date = new Date().toISOString().slice(0, 10);
  await exec(
    `INSERT INTO bible_reading_history (id, user_id, version, book_id, chapter, read_date, read_at)
     VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)`,
    [newId('rh'), user.id, version, b.bookId, b.chapter, date, ts()]
  );
  // 显式"已记录读经"且读的是计划分配的章节时,自动打卡对应计划天数
  let planCheckins = 0;
  const completedDays: { planId: string; planTitle: string; day: number }[] = [];
  if (b.recordPlan) {
    const { autoCheckinOnRead } = await import('@/server/planProgress');
    const completed = await autoCheckinOnRead(user.id, b.bookId, b.chapter);
    planCheckins = completed.length;
    completedDays.push(...completed);
  }
  return ok({ ok: true, planCheckins, completedDays });
});
