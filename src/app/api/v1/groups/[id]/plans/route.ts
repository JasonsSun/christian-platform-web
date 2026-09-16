import { NextRequest } from 'next/server';
import { ok, withApi, badRequest, forbidden, unauthorized } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { readJson } from '@/server/http';
import { listGroupPlans, addGroupPlan, canManageGroup } from '@/server/groupPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

/** 团契的共读计划列表 */
export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const items = await listGroupPlans(ctx.params.id, viewer?.id);
  return ok({ items });
});

/** 添加共读计划（团长或平台管理员） */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await currentUser(req)) as UserRow | null;
  if (!user) throw unauthorized();
  const body = await readJson<{ planId?: string; startDate?: string }>(req);
  const planId = String(body?.planId || '').trim();
  if (!planId) throw badRequest('缺少 planId');
  const start = /^\d{4}-\d{2}-\d{2}$/.test(body?.startDate || '')
    ? String(body.startDate)
    : new Date().toISOString().slice(0, 10);

  const allowed = await canManageGroup(ctx.params.id, user.id, user.role);
  if (!allowed) throw forbidden('只有团长或管理员可以添加共读计划');

  try {
    await addGroupPlan(ctx.params.id, planId, start, user.id);
  } catch (e: any) {
    if (e?.message === 'PLAN_NOT_FOUND') throw badRequest('读经计划不存在');
    throw e;
  }
  const items = await listGroupPlans(ctx.params.id, user.id);
  return ok({ items });
});
