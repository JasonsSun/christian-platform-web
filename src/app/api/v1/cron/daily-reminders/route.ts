import { NextRequest } from 'next/server';
import { ok, withApi, forbidden, readJson } from '@/server/http';
import { requireRole } from '@/server/auth';
import { runDueReminders, nowInZone } from '@/server/reminders';
import { runNotifyJobs } from '@/server/notify';

export const dynamic = 'force-dynamic';

/**
 * 每日提醒触发器 —— 整个通知链路此前缺的「谁来启动」这一环。
 *
 * 由外部 cron 调用,建议每 10 分钟一次(提醒判定窗口是 30 分钟,10 分钟粒度必然命中
 * 且配合日期去重不会重复发送):
 *
 *   curl -X POST https://<域名>/api/v1/cron/daily-reminders \
 *        -H "x-cron-secret: $CRON_SECRET"
 *
 * 鉴权二选一:
 *   - 配了环境变量 CRON_SECRET 时,校验请求头 x-cron-secret;
 *   - 没配时退化为「管理员可触发」,方便在后台手动点一次验证链路。
 *
 * 同时消费一下外发队列(runNotifyJobs),否则邮件/微信只会堆积在 notify_jobs 里,
 * 要等到别处调用才发送。
 */
export const POST = withApi(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET || '';
  const got = req.headers.get('x-cron-secret') || '';
  if (secret) {
    if (!got || got !== secret) throw forbidden('cron secret 无效');
  } else {
    // 未配 CRON_SECRET 时,至少保证后台能手动跑一次验证链路
    await requireRole(req, ['admin']);
  }

  const body = await readJson<any>(req).catch(() => ({}) as any);
  const { date, hhmm } = nowInZone();
  const reminders = await runDueReminders();

  let jobs = null;
  if (body?.dispatchJobs !== false) {
    jobs = await runNotifyJobs(Number(body?.jobLimit) || 50);
  }

  return ok({ at: `${date} ${hhmm}`, reminders, jobs });
});
