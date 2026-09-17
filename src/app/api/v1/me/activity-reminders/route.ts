import { NextRequest } from 'next/server';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { listReminders, setReminder, clearReminder, LEAD_OPTIONS } from '@/server/activityReminders';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/v1/me/activity-reminders                我的活动提醒（默认只看未开始的）
 * POST   /api/v1/me/activity-reminders { activityId, leadMinutes }  订阅/改提醒
 * DELETE /api/v1/me/activity-reminders?activityId=xxx 取消提醒（幂等）
 */

export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const items = await listReminders(user.id, !all);
  return ok({ items, total: items.length, leadOptions: LEAD_OPTIONS });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await req.json().catch(() => ({} as any));
  const activityId = typeof body?.activityId === 'string' ? body.activityId.trim() : '';
  if (!activityId) throw new HttpError(422, 'VALIDATION_FAILED', '请传入 activityId');
  const item = await setReminder(user.id, activityId, body?.leadMinutes);
  const items = await listReminders(user.id, true);
  return ok({ item, items, total: items.length }, 201);
});

export const DELETE = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const activityId = (new URL(req.url).searchParams.get('activityId') || '').trim();
  if (!activityId) throw new HttpError(422, 'VALIDATION_FAILED', '请传入 activityId');
  const removed = await clearReminder(user.id, activityId);
  const items = await listReminders(user.id, true);
  return ok({ removed, items, total: items.length });
});
