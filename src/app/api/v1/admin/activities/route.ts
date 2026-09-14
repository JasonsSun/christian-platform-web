import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, num, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';
import { cancelActivity } from '@/server/activities';

export const dynamic = 'force-dynamic';

/** 活动管理:列表(含报名/签到统计) */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const status = sp.get('status') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(a.title LIKE ? OR a.city LIKE ? OR a.location LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { where.push('a.status = ?'); args.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT a.id, a.title, a.category, a.city, a.location, a.capacity, a.status,
            DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
            DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name AS organizer_name, u.username AS organizer_username,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='confirmed') AS confirmed,
            (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status='waitlist') AS waitlist,
            (SELECT COUNT(*) FROM activity_checkins ck WHERE ck.activity_id = a.id) AS checkins
     FROM activities a LEFT JOIN users u ON u.id = a.organizer_id
     ${whereSql} ORDER BY a.start_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM activities a ${whereSql}`, args);
  const byStatus = await q<any>(`SELECT status, COUNT(*) AS c FROM activities GROUP BY status`);
  return ok({
    items: rows.map((r) => ({
      id: r.id, title: r.title, category: r.category, city: r.city, location: r.location,
      capacity: Number(r.capacity), status: r.status, startAt: r.start_at, createdAt: r.created_at,
      organizer: r.organizer_name || r.organizer_username || '',
      confirmed: Number(r.confirmed), waitlist: Number(r.waitlist), checkins: Number(r.checkins),
    })),
    total: Number(total?.c || 0), page, pageSize,
    byStatus: byStatus.map((s) => ({ status: s.status, c: Number(s.c) })),
  });
});

/**
 * 活动管理：改状态（上架/下架/取消）。
 * 取消活动时，除通知创建人外，**必须通知全部参与人**（创建人 + 管理员均可取消）。
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ activityId?: string; status?: string; reason?: string }>(req);
  if (!body.activityId) throw new HttpError(400, 'BAD_REQUEST', '缺少 activityId');
  if (!body.status || !['published', 'offline', 'cancelled'].includes(body.status)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '状态无效');
  }
  const act = await one<any>(`SELECT id, title, organizer_id FROM activities WHERE id = ?`, [body.activityId]);
  if (!act) throw notFound('活动不存在');

  if (body.status === 'cancelled') {
    // 走统一的取消逻辑：改状态 + 通知全部参与人（幂等，已取消则不重复通知）
    const res = await cancelActivity(body.activityId, { actorId: admin.id, reason: body.reason });
    await audit(admin.id, 'ACTIVITY_CANCEL_BY_ADMIN', 'activity', body.activityId,
      `管理员取消活动《${act.title}》，通知 ${res.notified} 名参与人`, clientIp(req));
    // 创建人若不在参与人之列，也告知一声
    if (act.organizer_id && !res.alreadyCancelled) {
      await notify(act.organizer_id, 'activity_cancelled', '你的活动已被取消',
        `你创建的活动「${act.title}」已被平台管理员取消。`, `/activities/${body.activityId}`);
    }
    return ok({ id: body.activityId, status: 'cancelled', updated: true, notified: res.notified });
  }

  await exec(`UPDATE activities SET status = ? WHERE id = ?`, [body.status, body.activityId]);
  await audit(admin.id, 'ACTIVITY_STATUS_CHANGE', 'activity', body.activityId, `${act.title} -> ${body.status}`, clientIp(req));
  if (act.organizer_id) {
    await notify(act.organizer_id, 'activity', '活动状态更新', `「${act.title}」状态已更新为 ${body.status}`, `/activities/${body.activityId}`);
  }
  return ok({ id: body.activityId, status: body.status, updated: true });
});
