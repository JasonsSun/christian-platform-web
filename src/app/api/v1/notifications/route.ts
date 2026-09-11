import { NextRequest } from 'next/server';
import { q, one } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireUser } from '@/server/auth';
import { mapNotification } from '@/server/mappers';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);
  const onlyUnread = sp.get('unread') === 'true';

  const where = onlyUnread ? 'AND `read` = 0' : '';
  const rows = await q<any>(
    `SELECT id, type, title, body, link, \`read\`,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM notifications WHERE user_id = ? ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [user.id, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? ${where}`, [user.id]);
  const unread = await one<any>(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND \`read\` = 0`, [user.id]);

  return ok({
    items: rows.map(mapNotification),
    total: Number(total?.c || 0),
    unread: Number(unread?.c || 0),
    page, pageSize,
  });
});
