import { NextRequest } from 'next/server';
import { newId, one, ts, tx } from '@/server/db';
import { ok, withApi, notFound, conflict } from '@/server/http';
import { requireUser } from '@/server/auth';
import { dispatchOutbox, emit, audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * 并发报名:事务内 SELECT ... FOR UPDATE 串行化,
 * 保证 confirmed 人数 <= capacity(超出进入候补队列),且同一用户幂等。
 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const activityId = ctx.params.id;

  const result = await tx(async (conn) => {
    const [actRows] = await conn.query<any[]>(
      `SELECT id, title, capacity, start_at, status FROM activities WHERE id = ? FOR UPDATE`, [activityId]
    );
    const act = actRows[0];
    if (!act) throw notFound('活动不存在');
    if (act.status === 'cancelled') throw conflict('该活动已取消，无法报名');
    if (act.status === 'offline') throw conflict('该活动已下架，暂不接受报名');

    const [existRows] = await conn.query<any[]>(
      `SELECT id, status FROM activity_registrations WHERE activity_id = ? AND user_id = ?`, [activityId, user.id]
    );
    const exist = existRows[0];
    if (exist && exist.status !== 'cancelled') {
      throw conflict('你已报名该活动');
    }

    const [countRows] = await conn.query<any[]>(
      `SELECT COUNT(*) AS c FROM activity_registrations WHERE activity_id = ? AND status = 'confirmed'`, [activityId]
    );
    const confirmed = Number(countRows[0].c);
    const status = confirmed < Number(act.capacity) ? 'confirmed' : 'waitlist';

    if (exist) {
      await conn.query(`UPDATE activity_registrations SET status = ?, created_at = ? WHERE id = ?`,
        [status, ts(), exist.id]);
    } else {
      await conn.query(
        `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at) VALUES (?,?,?,?,?)`,
        [newId('reg'), activityId, user.id, status, ts()]
      );
    }
    return { status, confirmed: confirmed + (status === 'confirmed' ? 1 : 0), title: act.title };
  });

  await emit('activity.registered',
    { activityId, actorId: user.id, actorName: user.display_name, status: result.status });
  await dispatchOutbox();
  await audit(user.id, 'ACTIVITY_REGISTER', 'activity', activityId,
    `报名《${result.title}》(${result.status})`, '');

  const row = await one<any>(
    `SELECT (SELECT COUNT(*) FROM activity_registrations WHERE activity_id = ? AND status='confirmed') AS confirmed_count,
            (SELECT COUNT(*) FROM activity_registrations WHERE activity_id = ? AND status='waitlist') AS waitlist_count`,
    [activityId, activityId]
  );
  return ok({
    status: result.status,
    confirmedCount: Number(row?.confirmed_count || 0),
    waitlistCount: Number(row?.waitlist_count || 0),
  });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const activityId = ctx.params.id;

  // 创建人即第一个参与人,不应从自己创建的活动里「取消报名」消失。
  const act = await one<any>(`SELECT organizer_id FROM activities WHERE id = ?`, [activityId]);
  if (act && act.organizer_id === user.id) {
    throw conflict('你是活动创建人，已自动参与，无需取消报名');
  }

  const promoted = await tx(async (conn) => {
    const [rows] = await conn.query<any[]>(
      `SELECT id, status FROM activity_registrations WHERE activity_id = ? AND user_id = ? FOR UPDATE`,
      [activityId, user.id]
    );
    const reg = rows[0];
    if (!reg || reg.status === 'cancelled') throw notFound('你没有报名该活动');
    await conn.query(`UPDATE activity_registrations SET status = 'cancelled' WHERE id = ?`, [reg.id]);

    // 释放名额后,将最早的候补转为正式
    if (reg.status === 'confirmed') {
      const [wait] = await conn.query<any[]>(
        `SELECT id, user_id FROM activity_registrations WHERE activity_id = ? AND status = 'waitlist' ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [activityId]
      );
      if (wait[0]) {
        await conn.query(`UPDATE activity_registrations SET status = 'confirmed' WHERE id = ?`, [wait[0].id]);
        return { userId: wait[0].user_id as string, title: '' };
      }
    }
    return null;
  });

  // 候补转正后要告知本人,否则他不知道自己已经排上了
  if (promoted) {
    const act = await one<any>(`SELECT title FROM activities WHERE id = ?`, [activityId]);
    await notify(
      promoted.userId,
      'activity_promoted',
      '🎉 候补已转正',
      `「${act?.title || '活动'}」有参与者取消报名，你已从候补转为正式参与，请按时参加。`,
      `/activities/${activityId}`,
    );
  }

  await audit(user.id, 'ACTIVITY_CANCEL', 'activity', activityId, '取消报名', '');
  return ok({ cancelled: true, promoted: !!promoted });
});
