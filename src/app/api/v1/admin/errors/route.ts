import { NextRequest } from 'next/server';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';
import { recentErrors, monitorEnabled } from '@/server/monitor';

export const dynamic = 'force-dynamic';

/**
 * 查看最近错误（仅管理员）。
 * 没接 Sentry 时，这是最快的"线上到底怎么了"入口。
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const limit = num(new URL(req.url).searchParams.get('limit'), 50);
  return ok({
    items: recentErrors(limit),
    monitor: monitorEnabled(),
  });
});
