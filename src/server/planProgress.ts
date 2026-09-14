import { exec, one, q, newId, ts } from '@/server/db';
import { getPlan, decidePlanCheckin } from '@/lib/readingPlans';

/**
 * 真实读经后自动打卡：把"读过某章"反查到「已报名」计划的对应天数并标记完成。
 *
 * 关联规则（修复前存在三处漏洞，现已修正）：
 *  1) 仅对"用户已报名"的计划生效 —— 读任意章节不再被静默计入未选的计划。
 *  2) 多章日(如诗篇30天一天5篇)：该天分配的所有章都读完后，才打勾这一天的章。
 *  3) 同章多天(如诗篇23篇默想7天,7天都读诗篇23章)：每读完一次推进"当前未完成的下一天"。
 *
 * 幂等：已打勾的天不重复插入；重复读经不会取消已有打卡。
 * 返回本次新完成的 {planId, planTitle, day}，供读经页提示"已完成《X》第Y天"。
 */

let enrollChecked = false;
/** 运行时幂等建表：兼容升级前已存在的库（schema.sql 仅首次初始化执行） */
export async function ensureEnrollmentTable(): Promise<void> {
  if (enrollChecked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS reading_plan_enrollment (
        user_id     CHAR(36)    NOT NULL,
        plan_id     VARCHAR(64) NOT NULL,
        enrolled_at DATETIME    NOT NULL,
        PRIMARY KEY (user_id, plan_id),
        KEY idx_rpe_user (user_id),
        CONSTRAINT fk_rpe_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch {
    /* 并发启动竞态，忽略 */
  }
  enrollChecked = true;
}

/** 报名一个计划（幂等）。返回计划是否存在 */
export async function enrollPlan(userId: string, planId: string): Promise<boolean> {
  const plan = getPlan(planId);
  if (!plan) return false;
  await ensureEnrollmentTable();
  await exec(
    `INSERT IGNORE INTO reading_plan_enrollment (user_id, plan_id, enrolled_at) VALUES (?,?,?)`,
    [userId, planId, ts()]
  );
  return true;
}

/** 是否已报名某计划 */
export async function isEnrolled(userId: string, planId: string): Promise<boolean> {
  await ensureEnrollmentTable();
  const r = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM reading_plan_enrollment WHERE user_id=? AND plan_id=?`,
    [userId, planId]
  );
  return Number(r?.c || 0) > 0;
}

/**
 * 用户"已加入"的计划 id 列表 = 显式报名表 ∪ 已有打卡进度的计划。
 * 后者兼容升级前数据：那时没有报名表，靠手动打卡进入计划也算加入。
 */
export async function enrolledPlanIds(userId: string): Promise<string[]> {
  await ensureEnrollmentTable();
  const rows = await q<{ plan_id: string }>(
    `SELECT plan_id FROM reading_plan_enrollment WHERE user_id=?
     UNION
     SELECT plan_id FROM reading_plan_progress WHERE user_id=?`,
    [userId, userId]
  );
  return Array.from(new Set(rows.map((r) => String(r.plan_id))));
}

export async function autoCheckinOnRead(
  userId: string,
  bookId: string,
  chapter: number
): Promise<{ planId: string; planTitle: string; day: number }[]> {
  const planIds = await enrolledPlanIds(userId);
  if (planIds.length === 0) return [];

  // 该用户已读的所有章（一次查询），供多章日"是否全部读完"判定
  const hist = await q<{ book_id: string; chapter: number }>(
    `SELECT book_id, chapter FROM bible_reading_history WHERE user_id=?`,
    [userId]
  );
  const readKeys = new Set(hist.map((r) => `${r.book_id}:${r.chapter}`));

  const completed: { planId: string; planTitle: string; day: number }[] = [];
  for (const planId of planIds) {
    const plan = getPlan(planId);
    if (!plan) continue;

    const doneRows = await q<{ day: number }>(
      `SELECT day FROM reading_plan_progress WHERE user_id=? AND plan_id=?`,
      [userId, planId]
    );
    const doneDays = new Set(doneRows.map((r) => Number(r.day)));

    const day = decidePlanCheckin(plan, bookId, chapter, readKeys, doneDays);
    if (day == null || doneDays.has(day)) continue;

    // 边界保护：day 必须在计划天数范围内
    if (day < 1 || day > plan.days) continue;

    await exec(
      `INSERT IGNORE INTO reading_plan_progress (id, user_id, plan_id, day, done_at) VALUES (?,?,?,?,?)`,
      [newId('rpp'), userId, planId, day, ts()]
    );
    completed.push({ planId, planTitle: plan.title, day });
  }
  return completed;
}
