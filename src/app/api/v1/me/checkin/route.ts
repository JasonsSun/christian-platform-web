import { NextRequest } from 'next/server';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { dailyCheckin, checkinView } from '@/server/growth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 当前签到状态（不写入） */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  return ok(await checkinView(user.id));
});

/** 签到（幂等：同一天重复调用只返回当前状态，already=true） */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const { view, already, bonus } = await dailyCheckin(user.id);
  return ok({
    ...view,
    already,
    message: already ? '今天已经签到过了' : `签到成功，已连续 ${view.streak} 天`,
    bonus,
  });
});
