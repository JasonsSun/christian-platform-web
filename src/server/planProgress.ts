import { exec, one, newId, ts } from '@/server/db';

/**
 * 真实读经后自动打卡：把"读过某章"反查到读经计划的对应天数并标记完成。
 * 仅 INSERT 不存在的(幂等),不会因重复读经而重复打卡,也不会取消已有的打卡。
 *
 * 判定标准：用户在「分配到的章节」点过「已记录读经」(显式声明已读),
 * 即视为该天读完 —— 这比"打开页面就算读"更严谨,又比纯手动 toggle 更可信。
 */
export async function autoCheckinOnRead(
  userId: string,
  bookId: string,
  chapter: number
): Promise<number> {
  const { matchPlanDay } = await import('@/lib/readingPlans');
  const matches = matchPlanDay(bookId, chapter);
  let added = 0;
  for (const m of matches) {
    const existing = await one<{ id: string }>(
      `SELECT id FROM reading_plan_progress WHERE user_id=? AND plan_id=? AND day=?`,
      [userId, m.planId, m.day]
    );
    if (!existing) {
      await exec(
        `INSERT INTO reading_plan_progress (id, user_id, plan_id, day, done_at) VALUES (?,?,?,?,?)`,
        [newId('rpp'), userId, m.planId, m.day, ts()]
      );
      added++;
    }
  }
  return added;
}
