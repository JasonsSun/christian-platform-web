import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, notFound, HttpError, readJson, clientIp } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapActivity } from '@/server/mappers';
import { audit } from '@/server/services';
import { assertCanCancelActivity, cancelActivity } from '@/server/activities';
import { str } from '@/server/sanitize';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const id = ctx.params.id;
  const vid = viewer?.id;
  const row = await one<any>(
    `SELECT a.id, a.title, a.description, a.category, a.location, a.city, a.lat, a.lng, a.capacity, a.cover, a.status,
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

/**
 * 取消活动（创建人或管理员）。
 * 取消是单方决定，不需要参与人同意；但必须给所有参与人发通知。
 * 同时支持 POST 到 /activities/[id]/cancel（见该路由）。
 */
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = ctx.params.id;
  const body = await readJson<{ status?: string; reason?: string; location?: string; city?: string; lat?: number | null; lng?: number | null }>(req).catch(
    () => ({}) as any,
  );

  const act = await one<any>(`SELECT id, title, status, organizer_id FROM activities WHERE id = ?`, [id]);
  if (!act) throw notFound('活动不存在');
  const isOrganizerOrAdmin = act.organizer_id === user.id || user.role === 'admin';
  if (!isOrganizerOrAdmin) throw new HttpError(403, 'FORBIDDEN', '只有活动组织者或管理员可以修改');

  // 地点 / 坐标编辑
  const sets: string[] = [];
  const params: any[] = [];
  if (body.location !== undefined) { sets.push('location = ?'); params.push(str(body.location).slice(0, 200)); }
  if (body.city !== undefined) { sets.push('city = ?'); params.push(str(body.city).slice(0, 64)); }
  if (body.lat !== undefined) { sets.push('lat = ?'); params.push(body.lat == null || body.lat === '' ? null : Number(body.lat)); }
  if (body.lng !== undefined) { sets.push('lng = ?'); params.push(body.lng == null || body.lng === '' ? null : Number(body.lng)); }
  if (sets.length) {
    await exec(`UPDATE activities SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  }

  // 取消活动
  if (body.status === 'cancelled') {
    if (!isOrganizerOrAdmin) throw new HttpError(403, 'FORBIDDEN', '只有活动组织者或管理员可以取消');
    assertCanCancelActivity(act, user);
    const res = await cancelActivity(id, { actorId: user.id, reason: body.reason });
    if (!res.alreadyCancelled) {
      await audit(user.id, 'ACTIVITY_CANCEL_BY_ORGANIZER', 'activity', id,
        `取消活动《${res.title}》，通知 ${res.notified} 名参与人`, clientIp(req));
    }
    return ok({ id, status: 'cancelled', notified: res.notified, alreadyCancelled: res.alreadyCancelled });
  }

  if (!sets.length && body.status === undefined) {
    throw new HttpError(422, 'VALIDATION_FAILED', '没有可更新的字段');
  }
  return ok({ id, updated: true });
});

/** 删除活动（仅创建人或管理员）。报名/签到由外键级联清除。 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = ctx.params.id;
  const act = await one<any>(`SELECT id, title, organizer_id FROM activities WHERE id = ?`, [id]);
  if (!act) throw notFound('活动不存在');
  assertCanCancelActivity(act, user);

  await exec(`DELETE FROM activities WHERE id = ?`, [id]);
  await audit(user.id, 'ACTIVITY_DELETE', 'activity', id, `删除活动《${act.title}》`, clientIp(req));
  return ok({ id, deleted: true });
});
