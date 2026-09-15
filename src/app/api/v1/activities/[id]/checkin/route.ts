import { NextRequest } from 'next/server';
import { exec, one, q, newId, ts } from '@/server/db';
import { ok, withApi, forbidden, notFound } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/v1/activities/{id}/checkin  -> 活动签到(需已报名) */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const activityId = ctx.params.id;
  const act = await one<any>(`SELECT id, title, organizer_id FROM activities WHERE id = ?`, [activityId]);
  if (!act) throw notFound('活动不存在');
  const reg = await one<any>(
    `SELECT id FROM activity_registrations WHERE activity_id = ? AND user_id = ? AND status <> 'cancelled'`,
    [activityId, user.id]
  );
  // 创建人即第一个参与人:历史活动可能漏写报名记录,这里兜底补齐,避免「已自动加入」却签到被拦。
  if (!reg) {
    if (act.organizer_id === user.id) {
      await exec(
        `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at)
         VALUES (?,?,?,'confirmed',?)
         ON DUPLICATE KEY UPDATE status='confirmed'`,
        [newId('reg'), activityId, user.id, ts()]
      );
    } else {
      throw forbidden('请先报名该活动再签到');
    }
  }

  const existing = await one<any>(
    `SELECT id FROM activity_checkins WHERE activity_id = ? AND user_id = ?`, [activityId, user.id]
  );
  if (existing) {
    const [cnt] = await q<any>(`SELECT COUNT(*) c FROM activity_checkins WHERE activity_id = ?`, [activityId]);
    return ok({ checkedIn: true, already: true, count: Number(cnt.c) });
  }
  await exec(
    `INSERT INTO activity_checkins (id, activity_id, user_id, created_at) VALUES (?,?,?,?)`,
    [newId('ci'), activityId, user.id, ts()]
  );
  await audit(user.id, 'ACTIVITY_CHECKIN', 'activity', activityId, `签到《${act.title}》`);
  if (act.organizer_id && act.organizer_id !== user.id) {
    await notify(act.organizer_id, 'activity_checkin', '有人签到你的活动',
      `${user.display_name} 签到《${act.title}》`, `/activities/${activityId}`);
  }
  const [cnt] = await q<any>(`SELECT COUNT(*) c FROM activity_checkins WHERE activity_id = ?`, [activityId]);
  return ok({ checkedIn: true, already: false, count: Number(cnt.c) });
});
