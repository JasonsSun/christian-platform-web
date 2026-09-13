import { NextRequest } from 'next/server';
import { ok, withApi, notFound } from '@/server/http';
import { currentUser } from '@/server/auth';
import { q } from '@/server/db';
import { getPlan } from '@/lib/readingPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/v1/plans/[id] —— 计划详情 + 每日安排 + 当前用户打卡状态 */
export const GET = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const plan = getPlan(id);
  if (!plan) throw notFound('计划不存在');

  const user = await currentUser(req);
  let doneSet = new Set<number>();
  if (user) {
    const rows = await q<{ day: number }>(
      `SELECT day FROM reading_plan_progress WHERE user_id=? AND plan_id=? ORDER BY day`,
      [user.id, id]
    );
    doneSet = new Set(rows.map((r) => Number(r.day)));
  }

  const days = Array.from({ length: plan.days }, (_, i) => {
    const day = i + 1;
    return { day, reading: plan.readingOf(day), link: plan.linkOf(day), done: doneSet.has(day) };
  });

  return ok({
    signedIn: !!user,
    plan: {
      id: plan.id,
      title: plan.title,
      subtitle: plan.subtitle,
      emoji: plan.emoji,
      accent: plan.accent,
      days: plan.days,
    },
    doneDays: doneSet.size,
    days,
  });
});
