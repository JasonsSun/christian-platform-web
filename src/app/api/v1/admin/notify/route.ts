import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';
import { runNotifyJobs, notifyQueueStats } from '@/server/notify';
import { smtpConfigured } from '@/server/channels/email';
import { wechatConfigured } from '@/server/channels/wechat';

export const dynamic = 'force-dynamic';

/** 外发通道健康度 + 队列统计 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const stats = await notifyQueueStats();
  const recent = await q<any>(
    `SELECT id, user_id, channel, kind, title, status, reason, attempts,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM notify_jobs ORDER BY created_at DESC LIMIT ?`,
    [Math.min(num(new URL(req.url).searchParams.get('limit'), 20), 100)]
  );
  return ok({
    ...stats,
    channels: {
      email: smtpConfigured(),
      wechat: wechatConfigured(),
      sms: false,
    },
    recent,
  });
});

/** 手动冲刷外发队列(生产环境应由定时任务调用同一函数) */
export const POST = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const limit = Math.min(num(new URL(req.url).searchParams.get('limit'), 50), 200);
  const result = await runNotifyJobs(limit);
  return ok(result);
});
