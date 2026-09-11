import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const action = sp.get('action') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 30), 100);

  const where = action ? 'WHERE a.action = ?' : '';
  const args: any[] = action ? [action] : [];

  const rows = await q<any>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.ip,
            DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name AS actor_name, u.username AS actor_username
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM audit_logs a ${where}`, args);
  return ok({ items: rows, total: Number(total?.c || 0), page, pageSize });
});
