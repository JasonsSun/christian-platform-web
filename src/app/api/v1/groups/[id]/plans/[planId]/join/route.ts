import { NextRequest } from 'next/server';
import { ok, withApi, badRequest, forbidden, unauthorized, readJson } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { joinGroupPlan, leaveGroupPlan, isGroupMember, listGroupPlans } from '@/server/groupPlans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string; planId: string } };

/**
 * 加入 / 退出共读。
 * 加入时会自动报名该读经计划 —— 这是关键联动：之后读对应章节会由 autoCheckinOnRead 自动打卡，
 * 成员之间才能互看进度。
 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await currentUser(req)) as UserRow | null;
  if (!user) throw unauthorized();
  const body = await readJson<{ join?: boolean }>(req).catch(() => ({}) as any);
  const wantJoin = body?.join !== false; // 默认加入

  const member = await isGroupMember(ctx.params.id, user.id);
  if (!member) throw forbidden('只有团契成员可以参与共读');

  try {
    if (wantJoin) await joinGroupPlan(ctx.params.id, ctx.params.planId, user.id);
    else await leaveGroupPlan(ctx.params.id, ctx.params.planId, user.id);
  } catch (e: any) {
    if (e?.message === 'PLAN_NOT_FOUND') throw badRequest('读经计划不存在');
    if (e?.message === 'GROUP_PLAN_NOT_FOUND') throw badRequest('该团契未选择此共读计划');
    throw e;
  }
  const items = await listGroupPlans(ctx.params.id, user.id);
  return ok({ items });
});
