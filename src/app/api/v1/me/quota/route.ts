import { NextRequest } from 'next/server';
import { ok, withApi, num } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { getQuota, fmtMin } from '@/server/quota';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 我的成长画像与当前上传配额(refresh=1 强制重算) */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const refresh = num(new URL(req.url).searchParams.get('refresh'), 0) === 1;
  const view = await getQuota(user.id, refresh);
  return ok({
    ...view,
    hints: [
      `当前等级「${view.levelName}」· 信任分 ${view.trustScore}`,
      `视频最长 ${fmtMin(view.policy.maxVideoSeconds)} / 单个 ≤ ${view.policy.maxVideoMb}MB`,
      `音乐最长 ${fmtMin(view.policy.maxAudioSeconds)} / 单个 ≤ ${view.policy.maxAudioMb}MB`,
      `今日已上传 ${view.usage.todayCount}/${view.policy.dailyUploads} 个`,
      view.next
        ? `再得 ${view.next.gap} 信任分升级「${view.next.name}」:${view.next.gains}`
        : '已达最高等级',
    ],
  });
});
