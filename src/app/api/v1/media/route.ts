import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { currentUser } from '@/server/auth';
import { publicUrlFor, kindLabel } from '@/server/media';

export const dynamic = 'force-dynamic';

function mapRow(r: any) {
  return {
    id: r.id, kind: r.kind, kindLabel: kindLabel(r.kind),
    title: r.title || r.file_name, fileName: r.file_name,
    mimeType: r.mime_type, extension: r.extension, sizeBytes: Number(r.size_bytes),
    url: r.storage_key ? publicUrlFor(r.storage_key) : '',
    posterUrl: r.poster_key ? publicUrlFor(r.poster_key) : '',
    durationSec: Number(r.duration_sec || 0), playCount: Number(r.play_count || 0),
    status: r.status, reviewStatus: r.review_status, reviewReason: r.review_reason,
    refCount: Number(r.ref_count), createdAt: r.created_at,
    source: r.source || 'upload', sourceRef: r.source_ref || null,
    owner: r.owner_name || '', ownerId: r.owner_id,
  };
}

/** 公开媒体画廊:仅展示审核通过且未被删除的文件 */
export const GET = withApi(async (req: NextRequest) => {
  await currentUser(req); // 可选登录,不影响公开可见性
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind') || '';
  const keyword = (sp.get('q') || '').trim();
  const source = (sp.get('source') || '').trim(); // upload | live | '' (全部)
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 24), 100);

  const where: string[] = [`m.review_status = 'approved'`, `m.status <> 'trashed'`];
  const args: any[] = [];
  if (kind) { where.push('m.kind = ?'); args.push(kind); }
  if (source === 'upload' || source === 'live') { where.push('m.source = ?'); args.push(source); }
  if (keyword) { where.push('(m.title LIKE ? OR m.file_name LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await q<any>(
    `SELECT m.*, u.display_name AS owner_name,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM media_files m LEFT JOIN users u ON u.id = m.owner_id
     ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM media_files m ${whereSql}`, args);
  const byKind = await q<any>(
    `SELECT kind, COUNT(*) AS c FROM media_files WHERE review_status='approved' AND status<>'trashed' GROUP BY kind`
  );
  const bySource = await q<any>(
    `SELECT source, COUNT(*) AS c FROM media_files WHERE review_status='approved' AND status<>'trashed' GROUP BY source`
  );
  return ok({
    items: rows.map(mapRow),
    total: Number(total[0]?.c || 0), page, pageSize,
    byKind: byKind.map((k) => ({ kind: k.kind, label: kindLabel(k.kind), c: Number(k.c) })),
    bySource: bySource.map((s) => ({ source: s.source || 'upload', c: Number(s.c) })),
  });
});
