import { NextRequest } from 'next/server';
import { one } from '@/server/db';
import { ok, withApi, notFound, readJson, clientIp } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit } from '@/server/services';
import { assertCanCancelActivity, cancelActivity } from '@/server/activities';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * 取消活动。
 * 权限：活动创建人 或 平台管理员。
 * 取消生效后向**全部参与人**（含候补）发站内通知，不需要他们同意。
 * 幂等：重复调用不重复发通知。
 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = ctx.params.id;
  const body = await readJson<{ reason?: string }>(req).catch(() => ({ reason: '' }));

  const act = await one<any>(`SELECT id, title, status, organizer_id FROM activities WHERE id = ?`, [id]);
  if (!act) throw notFound('活动不存在');
  assertCanCancelActivity(act, user);

  const res = await cancelActivity(id, { actorId: user.id, reason: body.reason });
  if (!res.alreadyCancelled) {
    await audit(user.id, 'ACTIVITY_CANCEL', 'activity', id,
      `取消活动《${res.title}》，通知 ${res.notified} 名参与人`, clientIp(req));
  }
  return ok({
    id,
    status: 'cancelled',
    notified: res.notified,
    alreadyCancelled: res.alreadyCancelled,
  });
});
