import { NextRequest } from 'next/server';
import { ok, withApi, forbidden } from '@/server/http';
import { requireRole } from '@/server/auth';
import { runActivityReminders } from '@/server/activityReminders';
import { runNotifyJobs } from '@/server/notify';

export const dynamic = 'force-dynamic';

/**
 * 活动提醒触发器 —— 与 daily-reminders 同套路，由外部 cron 每 10 分钟打一次：
 *
 *   curl -X POST https://<域名>/api/v1/cron/activity-reminders -H "x-cron-secret: $CRON_SECRET"
 *
 * 鉴权：配了 CRON_SECRET 校验请求头；没配时退化为管理员可触发（方便后台手动验证）。
 */

export const POST = withApi(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET || '';
  const got = req.headers.get('x-cron-secret') || '';
  if (secret) {
    if (!got || got !== secret) throw forbidden('cron secret 无效');
  } else {
    await requireRole(req, ['admin']);
  }

  const body = await req.json().catch(() => ({} as any));
  const result = await runActivityReminders(new Date(), Number(body?.limit) || 200);

  let jobs = null;
  if (body?.dispatchJobs !== false) {
    jobs = await runNotifyJobs(Number(body?.jobLimit) || 50);
  }

  return ok({ at: new Date().toISOString(), reminders: result, jobs });
});
