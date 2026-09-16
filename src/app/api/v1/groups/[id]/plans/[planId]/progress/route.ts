import { NextRequest } from 'next/server';
import { ok, withApi, notFound } from '@/server/http';
import { groupPlanProgress } from '@/server/groupPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string; planId: string } };

/** 共读进度榜：团契成员按完成天数排序，含「应读天数」以便看出谁掉队 */
export const GET = withApi(async (_req: NextRequest, ctx: Ctx) => {
  const r = await groupPlanProgress(ctx.params.id, ctx.params.planId);
  if (!r) throw notFound('共读计划不存在');
  return ok(r);
});
