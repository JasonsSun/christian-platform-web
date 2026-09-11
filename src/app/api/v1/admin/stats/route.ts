import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);

  const [totals] = await q<any>(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role='admin') AS admins,
      (SELECT COUNT(*) FROM users WHERE role='moderator') AS moderators,
      (SELECT COUNT(*) FROM users WHERE status='suspended') AS suspended,
      (SELECT COUNT(*) FROM contents) AS contents,
      (SELECT COUNT(*) FROM contents WHERE status='published') AS published,
      (SELECT COUNT(*) FROM contents WHERE status='pending_review') AS pending,
      (SELECT COUNT(*) FROM contents WHERE status='rejected') AS rejected,
      (SELECT COUNT(*) FROM review_tasks WHERE status='pending') AS pendingTasks,
      (SELECT COUNT(*) FROM activities) AS activities,
      (SELECT COUNT(*) FROM activity_registrations WHERE status='confirmed') AS registrations,
      (SELECT COUNT(*) FROM \`groups\`) AS groupCount,
      (SELECT COUNT(*) FROM prayers) AS prayers,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM notifications) AS notifications,
      (SELECT COUNT(*) FROM audit_logs) AS auditLogs,
      (SELECT COUNT(*) FROM outbox) AS events,
      (SELECT COUNT(*) FROM outbox WHERE status='pending') AS pendingEvents`);

  const byRole = await q<any>(`SELECT role, COUNT(*) AS c FROM users GROUP BY role`);
  const byStatus = await q<any>(`SELECT status, COUNT(*) AS c FROM contents GROUP BY status`);
  const growth = await q<any>(`
    SELECT DATE(created_at) AS d, COUNT(*) AS c FROM users
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY d`);
  const recentAudit = await q<any>(`
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.ip,
           DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           u.display_name AS actor_name
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC LIMIT 12`);
  const topContent = await q<any>(`
    SELECT c.id, c.title, c.like_count, c.view_count, c.comment_count, c.status
    FROM contents c ORDER BY c.view_count DESC LIMIT 8`);

  return ok({
    totals,
    byRole,
    byStatus,
    growth,
    recentAudit,
    topContent,
  });
});
