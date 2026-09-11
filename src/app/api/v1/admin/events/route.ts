import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';
import { dispatchOutbox } from '@/server/services';

export const dynamic = 'force-dynamic';

/** 事件中心:事件查询 + 消费者状态 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || '';
  const type = (sp.get('type') || '').trim();
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (type) { where.push('event_type = ?'); args.push(type); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT id, event_type, payload, status,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(processed_at,'%Y-%m-%dT%H:%i:%sZ') AS processed_at
     FROM outbox ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM outbox ${whereSql}`, args);
  const byStatus = await q<any>(`SELECT status, COUNT(*) AS c FROM outbox GROUP BY status`);
  const byType = await q<any>(`SELECT event_type, COUNT(*) AS c FROM outbox GROUP BY event_type ORDER BY c DESC`);
  return ok({
    items: rows.map((r) => ({
      id: r.id, eventType: r.event_type,
      payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload),
      status: r.status, createdAt: r.created_at, processedAt: r.processed_at,
    })),
    total: Number(total[0]?.c || 0), page, pageSize,
    byStatus: byStatus.map((s) => ({ status: s.status, c: Number(s.c) })),
    byType: byType.map((t) => ({ type: t.event_type, c: Number(t.c) })),
  });
});

/** 事件中心:手动触发一次消费者派发(演示用) */
export const POST = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  await dispatchOutbox(200);
  const pending = await q<any>(`SELECT COUNT(*) AS c FROM outbox WHERE status='pending'`);
  return ok({ dispatched: true, pending: Number(pending[0]?.c || 0) });
});
