import { NextRequest } from 'next/server';
import { ok, withApi, forbidden, unauthorized } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { removeGroupPlan, canManageGroup, listGroupPlans } from '@/server/groupPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string; planId: string } };

/** 移除团契共读计划（团长或平台管理员）。只解除共读关系，不删任何人的读经进度 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await currentUser(req)) as UserRow | null;
  if (!user) throw unauthorized();
  const allowed = await canManageGroup(ctx.params.id, user.id, user.role);
  if (!allowed) throw forbidden('只有团长或管理员可以移除共读计划');
  await removeGroupPlan(ctx.params.id, ctx.params.planId);
  const items = await listGroupPlans(ctx.params.id, user.id);
  return ok({ items });
});
