import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { currentUser } from '@/server/auth';
import { q } from '@/server/db';
import { READING_PLANS, planPercent } from '@/lib/readingPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/v1/plans —— 读经计划列表 + 当前用户各计划完成情况（未登录也可看） */
export const GET = withApi(async (req: NextRequest) => {
  const user = await currentUser(req);
  let rows: { plan_id: string; done: number }[] = [];
  if (user) {
    rows = await q<{ plan_id: string; done: number }>(
      `SELECT plan_id, COUNT(*) AS done FROM reading_plan_progress WHERE user_id=? GROUP BY plan_id`,
      [user.id]
    );
  }
  const doneMap = new Map(rows.map((r) => [r.plan_id, Number(r.done)]));
  return ok({
    signedIn: !!user,
    plans: READING_PLANS.map((p) => {
      const doneDays = doneMap.get(p.id) || 0;
      return {
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        emoji: p.emoji,
        accent: p.accent,
        days: p.days,
        doneDays,
        percent: planPercent(doneDays, p.days),
      };
    }),
  });
});
