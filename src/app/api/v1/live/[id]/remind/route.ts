import { NextRequest } from 'next/server';
import { ok, withApi, notFound, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getRoom } from '@/server/live';
import { q, one, exec, newId, ts } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 当前用户是否已预约 + 预约总数 */
export const GET = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const [remindedRow, countRow] = await Promise.all([
    one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM live_reminders WHERE room_id=? AND user_id=?`,
      [id, user.id]
    ),
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM live_reminders WHERE room_id=?`, [id]),
  ]);
  return ok({ reminded: !!remindedRow?.c, reminderCount: Number(countRow?.c || 0) });
});

/** 预约 / 取消预约（切换） */
export const POST = withApi(async (req: NextRequest, ctx: any) => {
  const id = ctx.params.id as string;
  const user = await requireUser(req);
  const room = await getRoom(id);
  if (!room) throw notFound('直播间不存在');
  // 已结束的直播不可预约;房主本人无需预约自己的直播
  if (room.status === 'ended') throw new HttpError(409, 'CONFLICT', '本场已结束，无法预约');
  if (room.owner_id === user.id) throw new HttpError(400, 'BAD_REQUEST', '你是主播本人，无需预约');

  const existing = await one<{ id: string }>(
    `SELECT id FROM live_reminders WHERE room_id=? AND user_id=?`,
    [id, user.id]
  );
  if (existing) {
    await exec(`DELETE FROM live_reminders WHERE id=?`, [existing.id]);
    const countRow = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM live_reminders WHERE room_id=?`, [id]);
    return ok({ reminded: false, reminderCount: Number(countRow?.c || 0) });
  }

  await exec(
    `INSERT INTO live_reminders (id, room_id, user_id, created_at) VALUES (?,?,?,?)`,
    [newId('lrm'), id, user.id, ts()]
  );
  const countRow = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM live_reminders WHERE room_id=?`, [id]);
  return ok({ reminded: true, reminderCount: Number(countRow?.c || 0) });
});
