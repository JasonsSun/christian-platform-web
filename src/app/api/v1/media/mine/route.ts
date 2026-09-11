import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { publicUrlFor, kindLabel } from '@/server/media';

export const dynamic = 'force-dynamic';

/** 我的上传:含待审核/已驳回/已通过全部状态 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const reviewStatus = sp.get('reviewStatus') || '';
  const kind = sp.get('kind') || '';
  const source = (sp.get('source') || '').trim();
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 24), 100);

  const where: string[] = ['m.owner_id = ?'];
  const args: any[] = [user.id];
  if (reviewStatus) { where.push('m.review_status = ?'); args.push(reviewStatus); }
  if (kind) { where.push('m.kind = ?'); args.push(kind); }
  if (source === 'upload' || source === 'live') { where.push('m.source = ?'); args.push(source); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await q<any>(
    `SELECT m.*,
            (SELECT COUNT(*) FROM media_processing_tasks t WHERE t.media_file_id = m.id) AS task_count,
            (SELECT COUNT(*) FROM media_processing_tasks t WHERE t.media_file_id = m.id AND t.status='failed') AS task_failed,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM media_files m ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM media_files m ${whereSql}`, args);
  const byReview = await q<any>(
    `SELECT review_status, COUNT(*) AS c FROM media_files WHERE owner_id = ? GROUP BY review_status`, [user.id]
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id, kind: r.kind, kindLabel: kindLabel(r.kind), title: r.title || r.file_name,
      fileName: r.file_name, mimeType: r.mime_type, extension: r.extension,
      sizeBytes: Number(r.size_bytes),
      url: r.storage_key ? publicUrlFor(r.storage_key) : '',
      posterUrl: r.poster_key ? publicUrlFor(r.poster_key) : '',
      durationSec: Number(r.duration_sec || 0), playCount: Number(r.play_count || 0),
      status: r.status, reviewStatus: r.review_status, reviewReason: r.review_reason,
      taskCount: Number(r.task_count), taskFailed: Number(r.task_failed),
      refCount: Number(r.ref_count),
      source: r.source || 'upload', sourceRef: r.source_ref || null,
      createdAt: r.created_at,
    })),
    total: Number(total[0]?.c || 0), page, pageSize,
    byReview: byReview.map((b) => ({ reviewStatus: b.review_status, c: Number(b.c) })),
  });
});
