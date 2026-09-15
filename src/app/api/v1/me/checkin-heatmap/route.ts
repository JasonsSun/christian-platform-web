import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { heatmapView } from '@/server/growth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/v1/me/checkin-heatmap -> 过去365天打卡热力图 + 成就统计 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await heatmapView(user.id));
});
