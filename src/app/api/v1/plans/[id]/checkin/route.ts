import { NextRequest } from 'next/server';
import { ok, withApi, notFound, badRequest, readJson } from '@/server/http';
import { requireUser } from '@/server/auth';
import { one, exec, newId, ts } from '@/server/db';
import { getPlan } from '@/lib/readingPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/v1/plans/[id]/checkin  body:{day}  —— 切换某天的打卡状态 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const plan = getPlan(id);
  if (!plan) throw notFound('计划不存在');

  const user = await requireUser(req);
  const body = await readJson<{ day?: number }>(req);
  const day = Number(body.day);
  if (!day || day < 1 || day > plan.days) throw badRequest('无效的天数');

  // 手动打卡前先确保已加入计划（未报名则自动报名，避免进度游离在计划之外）
  const { enrollPlan, isEnrolled } = await import('@/server/planProgress');
  if (!(await isEnrolled(user.id, id))) {
    await enrollPlan(user.id, id);
  }

  const existing = await one<{ id: string }>(
    `SELECT id FROM reading_plan_progress WHERE user_id=? AND plan_id=? AND day=?`,
    [user.id, id, day]
  );
  if (existing) {
    await exec(`DELETE FROM reading_plan_progress WHERE id=?`, [existing.id]);
  } else {
    await exec(
      `INSERT INTO reading_plan_progress (id, user_id, plan_id, day, done_at) VALUES (?,?,?,?,?)`,
      [newId('rpp'), user.id, id, day, ts()]
    );
  }
  const cnt = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM reading_plan_progress WHERE user_id=? AND plan_id=?`,
    [user.id, id]
  );
  return ok({ done: !existing, doneDays: Number(cnt?.c || 0) });
});
