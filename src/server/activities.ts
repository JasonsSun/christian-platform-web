import { exec, one, q } from '@/server/db';
import { notify } from '@/server/services';
import { HttpError, notFound } from '@/server/http';

/**
 * 活动取消（产品规则）
 *
 * - 唯一有权限取消的人：**活动创建人（organizer）** 与 **平台管理员（admin）**。
 * - 取消**不需要**参与人同意，属于组织者的单方决定。
 * - 取消时必须**通知全部参与人**（confirmed + waitlist，不含已 cancelled 的），
 *   让他们知道活动已取消，别白跑一趟。
 * - 幂等：已是 cancelled 的活动再次调用直接返回，不重复发通知。
 *
 * 状态取值见 schema：activities.status 为自由字符串，本平台用
 * published（已发布/上线中）| offline（已下架）| cancelled（已取消）。
 */
export type CancelResult = {
  id: string;
  title: string;
  cancelled: boolean;
  alreadyCancelled: boolean;
  notified: number;
};

export async function cancelActivity(
  activityId: string,
  opts: { actorId: string; reason?: string },
): Promise<CancelResult> {
  const act = await one<any>(
    `SELECT id, title, status, organizer_id FROM activities WHERE id = ?`,
    [activityId],
  );
  if (!act) throw notFound('活动不存在');

  if (act.status === 'cancelled') {
    return { id: act.id, title: act.title, cancelled: true, alreadyCancelled: true, notified: 0 };
  }

  await exec(`UPDATE activities SET status = 'cancelled' WHERE id = ?`, [activityId]);

  // 全部参与人（正式 + 候补），排除已自行取消报名的
  const participants = await q<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM activity_registrations
      WHERE activity_id = ? AND status <> 'cancelled'`,
    [activityId],
  );

  const reason = (opts.reason || '').trim();
  const extra = reason ? `\n原因：${reason}` : '';
  for (const p of participants) {
    await notify(
      p.user_id,
      'activity_cancelled',
      '活动已取消',
      `你报名的活动「${act.title}」已被取消，无需前往。${extra}`,
      `/activities/${activityId}`,
    );
  }

  return {
    id: act.id,
    title: act.title,
    cancelled: true,
    alreadyCancelled: false,
    notified: participants.length,
  };
}

/** 只有创建人本人或管理员可以取消活动；否则 403。 */
export function assertCanCancelActivity(
  act: { organizer_id: string },
  user: { id: string; role: string },
): void {
  if (act.organizer_id === user.id) return;
  if (user.role === 'admin') return;
  throw new HttpError(403, 'FORBIDDEN', '只有活动创建人或平台管理员可以取消活动');
}
