import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { badgeOverview } from '@/server/badges';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 我的成就徽章总览。
 * 顺带做一次达成判定并幂等授予（新解锁的放在 newEarned 里，前端可提示「刚刚解锁」）。
 * 只读查看用 /users/<id>/badges。
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await badgeOverview(user.id, true));
});
