import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';

export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/reports?status=open|dismissed|upheld|all */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'reports')) as UserRow;
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || 'open';
  const where = status === 'all' ? '' : `WHERE r.status = '${status}'`;
  const rows = await q<any>(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.status,
            DATE_FORMAT(r.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            rp.username AS reporter_name, rp.display_name AS reporter_display,
            c.title AS content_title, c.author_id AS content_author
     FROM reports r
     JOIN users rp ON rp.id = r.reporter_id
     LEFT JOIN contents c ON c.id = r.target_id AND r.target_type = 'content'
     ${where}
     ORDER BY r.created_at DESC LIMIT 100`
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason,
      detail: r.detail, status: r.status, createdAt: r.created_at,
      reporter: { username: r.reporter_name, displayName: r.reporter_display },
      contentTitle: r.content_title, contentAuthor: r.content_author,
    })),
  });
});
