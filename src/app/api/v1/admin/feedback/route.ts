import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/feedback?status=new|processing|done|rejected|all */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireRole(req, ['moderator', 'admin'])) as UserRow;
  void user;
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || 'new';
  const where = status === 'all' ? '' : `WHERE f.status = '${status}'`;

  const rows = await q<any>(
    `SELECT f.id, f.category, f.content, f.contact, f.page_url, f.status, f.admin_reply,
            DATE_FORMAT(f.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(f.handled_at,'%Y-%m-%dT%H:%i:%sZ') AS handled_at,
            u.username AS user_username, u.display_name AS user_display
     FROM platform_feedback f
     LEFT JOIN users u ON u.id = f.user_id
     ${where}
     ORDER BY f.created_at DESC LIMIT 200`
  );

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      contact: r.contact,
      pageUrl: r.page_url,
      status: r.status,
      adminReply: r.admin_reply,
      createdAt: r.created_at,
      handledAt: r.handled_at,
      user: r.user_username
        ? { username: r.user_username, displayName: r.user_display }
        : null,
    })),
  });
});
