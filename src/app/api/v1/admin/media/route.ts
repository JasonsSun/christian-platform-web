import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, num, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/** 媒体中心:文件列表 + 审核/处理统计 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const kind = sp.get('kind') || '';
  const status = sp.get('status') || '';
  const reviewStatus = sp.get('reviewStatus') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(m.file_name LIKE ? OR m.title LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  if (kind) { where.push('m.kind = ?'); args.push(kind); }
  if (status) { where.push('m.status = ?'); args.push(status); }
  if (reviewStatus) { where.push('m.review_status = ?'); args.push(reviewStatus); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT m.*, u.display_name AS owner_name,
            (SELECT COUNT(*) FROM media_processing_tasks t WHERE t.media_file_id = m.id) AS task_count,
            (SELECT COUNT(*) FROM media_processing_tasks t WHERE t.media_file_id = m.id AND t.status='failed') AS task_failed,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at_fmt
     FROM media_files m LEFT JOIN users u ON u.id = m.owner_id
     ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM media_files m ${whereSql}`, args);
  const agg = await one<any>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(size_bytes),0) AS bytes,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status='transcoding' THEN 1 ELSE 0 END) AS transcoding,
            SUM(CASE WHEN status='trashed' THEN 1 ELSE 0 END) AS trashed,
            SUM(CASE WHEN review_status='pending' THEN 1 ELSE 0 END) AS pending
     FROM media_files WHERE status <> 'trashed'`
  );
  const byKind = await q<any>(`SELECT kind, COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS bytes FROM media_files WHERE status<>'trashed' GROUP BY kind`);
  const pendingTasks = await one<any>(`SELECT COUNT(*) AS c FROM media_processing_tasks WHERE status IN ('pending','running')`);
  const failedTasks = await one<any>(`SELECT COUNT(*) AS c FROM media_processing_tasks WHERE status='failed'`);
  return ok({
    items: rows.map((r) => ({
      id: r.id, fileName: r.file_name, title: r.title || r.file_name, mimeType: r.mime_type, kind: r.kind,
      extension: r.extension, sizeBytes: Number(r.size_bytes), storageKey: r.storage_key, status: r.status,
      reviewStatus: r.review_status, reviewReason: r.review_reason, refCount: Number(r.ref_count),
      taskCount: Number(r.task_count), taskFailed: Number(r.task_failed),
      url: r.storage_key ? '/' + String(r.storage_key).replace(/\\/g, '/') : '',
      createdAt: r.created_at_fmt, owner: r.owner_name || '',
    })),
    total: Number(total?.c || 0), page, pageSize,
    totals: {
      files: Number(agg?.total || 0), bytes: Number(agg?.bytes || 0),
      failed: Number(agg?.failed || 0), transcoding: Number(agg?.transcoding || 0),
      trashed: Number(agg?.trashed || 0), pendingReview: Number(agg?.pending || 0),
      pendingTasks: Number(pendingTasks?.c || 0), failedTasks: Number(failedTasks?.c || 0),
    },
    byKind: byKind.map((k) => ({ kind: k.kind, c: Number(k.c), bytes: Number(k.bytes) })),
  });
});

/** 媒体中心:软删除 / 恢复 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ mediaId?: string; action?: 'trash' | 'restore' }>(req);
  if (!body.mediaId) throw new HttpError(400, 'BAD_REQUEST', '缺少 mediaId');
  const m = await one<any>(`SELECT id, file_name, status FROM media_files WHERE id = ?`, [body.mediaId]);
  if (!m) throw notFound('文件不存在');
  const next = body.action === 'restore' ? 'ready' : 'trashed';
  await exec(`UPDATE media_files SET status = ?, updated_at = ? WHERE id = ?`, [next, ts(), body.mediaId]);
  await audit(admin.id, 'MEDIA_STATUS_CHANGE', 'media', body.mediaId, `${m.file_name} -> ${next}`, clientIp(req));
  return ok({ id: body.mediaId, status: next, updated: true });
});
