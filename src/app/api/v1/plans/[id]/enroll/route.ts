import { NextRequest } from 'next/server';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser } from '@/server/auth';
import { enrollPlan } from '@/server/planProgress';
import { getPlan } from '@/lib/readingPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/v1/plans/[id]/enroll —— 加入(报名)一个读经计划，幂等 */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  if (!getPlan(id)) throw notFound('计划不存在');
  const user = await requireUser(req);
  const okEnroll = await enrollPlan(user.id, id);
  return ok({ ok: okEnroll, enrolled: okEnroll });
});
