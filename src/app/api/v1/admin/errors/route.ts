import { NextRequest } from 'next/server';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';
import { recentErrors, monitorEnabled } from '@/server/monitor';
import { listErrorEvents } from '@/server/errorEvents';

export const dynamic = 'force-dynamic';

/**
 * 查看最近错误（仅管理员）。
 * 没接 Sentry 时，这是最快的"线上到底怎么了"入口。
 *
 * 两个来源分开给：items 是本进程的环形缓冲（含 4xx，重启即清空），
 * stored 是落库的错误级记录（含堆栈，跨重启）。混成一个列表会让「这次是不是
 * 重启前的旧账」这件事重新变成要靠猜。
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const limit = num(new URL(req.url).searchParams.get('limit'), 50);
  return ok({
    items: recentErrors(limit),
    stored: await listErrorEvents(limit),
    monitor: monitorEnabled(),
  });
});
