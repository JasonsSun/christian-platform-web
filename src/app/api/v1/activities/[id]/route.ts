import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { mapActivity } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const id = ctx.params.id;
  const vid = viewer?.id;
  const row = await one<any>(
    `SELECT a.id, a.title, a.description, a.category, a.location, a.city, a.capacity, a.cover, a.status,
            DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
            DATE_FORMAT(a.end_at,'%Y-%m-%dT%H:%i:%sZ') AS end_at,
            DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS organizer_id, u.username AS organizer_username,
            u.display_name AS organizer_name, u.avatar_color AS organizer_color,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status = 'confirmed') AS confirmed_count,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status = 'waitlist') AS waitlist_count,
            (SELECT COUNT(*) FROM activity_checkins c WHERE c.activity_id = a.id) AS checkin_count,
            ${vid ? `(SELECT r.status FROM activity_registrations r WHERE r.activity_id = a.id AND r.user_id = ? AND r.status <> 'cancelled' LIMIT 1)` : 'NULL'} AS my_status,
            ${vid ? `EXISTS(SELECT 1 FROM activity_checkins c WHERE c.activity_id = a.id AND c.user_id = ?)` : '0'} AS my_checkin
     FROM activities a JOIN users u ON u.id = a.organizer_id WHERE a.id = ?`,
    vid ? [vid, vid, id] : [id]
  );
  if (!row) throw notFound('活动不存在');

  const participants = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.city, r.status,
            DATE_FORMAT(r.created_at,'%Y-%m-%dT%H:%i:%sZ') AS joined_at
     FROM activity_registrations r JOIN users u ON u.id = r.user_id
     WHERE r.activity_id = ? AND r.status <> 'cancelled'
     ORDER BY FIELD(r.status,'confirmed','waitlist'), r.created_at ASC LIMIT 60`, [id]
  );

  return ok({
    ...mapActivity({ ...row, registered: !!row.my_status }),
    checkinCount: Number(row.checkin_count),
    checkedIn: !!row.my_checkin,
    participants: participants.map((p) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarColor: p.avatar_color,
      city: p.city,
      status: p.status,
      joinedAt: p.joined_at,
    })),
  });
});
