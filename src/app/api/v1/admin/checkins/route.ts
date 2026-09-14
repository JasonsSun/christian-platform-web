import { NextRequest } from 'next/server';
import { q, one } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/checkins            —— 各活动报名/签到汇总
 * GET /api/v1/admin/checkins?activityId=xxx —— 单个活动签到名单明细
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'activities')) as UserRow;
  const sp = new URL(req.url).searchParams;
  const activityId = sp.get('activityId');

  if (activityId) {
    const act = await one<any>(
      `SELECT id, title, description, city, capacity,
              DATE_FORMAT(start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at
       FROM activities WHERE id = ?`,
      [activityId]
    );
    if (!act) throw notFound('活动不存在');

    const attendees = await q<any>(
      `SELECT u.id, u.display_name, u.username, u.avatar_color, u.city, u.church,
              DATE_FORMAT(ac.created_at,'%Y-%m-%dT%H:%i:%sZ') AS checked_at
       FROM activity_checkins ac
       JOIN users u ON u.id = ac.user_id
       WHERE ac.activity_id = ?
       ORDER BY ac.created_at DESC`,
      [activityId]
    );
    const count = await one<any>(`SELECT COUNT(*) AS c FROM activity_checkins WHERE activity_id = ?`, [activityId]);
    const regs = await one<any>(
      `SELECT COUNT(*) AS c FROM activity_registrations WHERE activity_id = ? AND status='confirmed'`,
      [activityId]
    );

    return ok({
      activity: {
        id: act.id, title: act.title, description: act.description, city: act.city,
        capacity: act.capacity, startAt: act.start_at,
      },
      attendees: attendees.map((r: any) => ({
        id: r.id, displayName: r.display_name, username: r.username, avatarColor: r.avatar_color,
        city: r.city, church: r.church, checkedAt: r.checked_at,
      })),
      total: Number(count?.c || 0),
      registrations: Number(regs?.c || 0),
    });
  }

  const rows = await q<any>(
    `SELECT a.id, a.title, a.city, a.capacity,
            DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='confirmed') AS confirmed,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='waitlist') AS waitlist,
            (SELECT COUNT(*) FROM activity_checkins c WHERE c.activity_id = a.id) AS checkins
     FROM activities a
     ORDER BY a.start_at DESC
     LIMIT 100`
  );

  return ok({
    items: rows.map((r: any) => ({
      id: r.id, title: r.title, city: r.city, capacity: r.capacity, startAt: r.start_at,
      confirmed: Number(r.confirmed), waitlist: Number(r.waitlist), checkins: Number(r.checkins),
    })),
    total: rows.length,
  });
});
