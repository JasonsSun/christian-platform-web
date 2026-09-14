import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { mapReviewTask } from '@/server/mappers';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'contents');
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || 'pending';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);

  const where = status === 'all' ? '' : 'WHERE rt.status = ?';
  const args = status === 'all' ? [] : [status];

  const rows = await q<any>(
    `SELECT rt.id, rt.status, rt.reason,
            DATE_FORMAT(rt.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(rt.decided_at,'%Y-%m-%dT%H:%i:%sZ') AS decided_at,
            c.id AS content_id, c.title, c.body, c.content_type,
            c.status AS content_status,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS content_created_at,
            u.id AS author_id, u.username, u.display_name, u.avatar_color
     FROM review_tasks rt
     JOIN contents c ON c.id = rt.content_id
     JOIN users u ON u.id = c.author_id
     ${where}
     ORDER BY rt.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await q<any>(`SELECT COUNT(*) AS c FROM review_tasks rt ${where}`, args);
  return ok({ items: rows.map(mapReviewTask), total: Number(total[0]?.c || 0), page, pageSize });
});
