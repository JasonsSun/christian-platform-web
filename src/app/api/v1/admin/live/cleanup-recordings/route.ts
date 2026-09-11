/**
 * 直播录像超期清理 - 手工 / 定时调用入口
 * --------------------------------------------------------------
 * 调用方式:
 *   1) HTTP: POST /api/v1/admin/live/cleanup-recordings
 *      供 cron / 任务调度器调用,需要 admin 权限
 *   2) 命令行: node -r tsx/cjs bin/cleanup-live-recordings.mjs
 *      需要本机有 mysql2 连接;复用 .env.local
 */
import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireRole } from '@/server/auth';
import { audit } from '@/server/services';
import { clientIp } from '@/server/http';
import { cleanupExpiredLiveRecordings } from '@/server/liveRecord';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireRole(req, ['admin']);
  const body = await safeJson(req);
  const hours = Number(body?.maxAgeHours) > 0 ? Number(body.maxAgeHours) : 24;
  const r = await cleanupExpiredLiveRecordings(hours);
  await audit(admin.id, 'LIVE_RECORDING_CLEANUP', 'live', null,
    `cleaned=${r.deleted} (maxAgeHours=${hours})`, clientIp(req));
  return ok(r);
});

async function safeJson(req: NextRequest) {
  try { return await req.json(); } catch { return null; }
}

// 当被误用为 GET 时提示
export const GET = withApi(async () => {
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', '请使用 POST 触发清理');
});
