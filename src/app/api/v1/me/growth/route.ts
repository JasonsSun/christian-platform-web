import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { growthOverview } from '@/server/growth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 我的成长总览：等级 / 信任分 / 下一等级 / 签到连续天数与本月日历 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await growthOverview(user.id));
});
