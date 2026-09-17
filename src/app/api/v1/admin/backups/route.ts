import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireRole } from '@/server/auth';
import { listBackups, createAppBackup, readBackupFile, deleteBackup, restoreAppBackup } from '@/server/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SCHEDULE = process.env.BACKUP_CRON || '17 3 * * *';

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const files = await listBackups();
  const lastApp = files.find((f) => f.source === 'app');
  return ok({
    files,
    cron: { schedule: CRON_SCHEDULE, note: '宿主机 cron 每日自动 mysqldump 全量备份（deploy/backup.sh）' },
    lastBackupAt: files.length ? files[0].mtime : null,
    lastAppBackupAt: lastApp ? lastApp.mtime : null,
  });
});

export const POST = withApi(async (req: NextRequest) => {
  const me = await requireRole(req, ['admin']);
  const r = await createAppBackup(me.id);
  return ok({ ...r, ok: true }, 201);
});

export const DELETE = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!name) throw new HttpError(422, 'VALIDATION_FAILED', '缺少文件名');
  await deleteBackup(name);
  return ok({ ok: true });
});

// 恢复：高危操作，前端必须二次确认
export const PATCH = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!name) throw new HttpError(422, 'VALIDATION_FAILED', '缺少文件名');
  const res = await restoreAppBackup(name);
  return ok({ ...res, ok: true });
});
