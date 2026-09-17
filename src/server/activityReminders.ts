import { exec, q, one, newId, ts } from '@/server/db';
import { HttpError } from '@/server/http';
import { notify } from '@/server/services';
import { sendPushToUser } from '@/server/webpush';

/**
 * 活动提醒（日历订阅提醒）。
 *
 * 用户可以对任一「已发布且未开始」的活动订阅一次提醒，选择提前量（30 分钟~3 天）。
 * 与每日提醒(reminders.ts)的区别：那是全局固定时刻，这是按活动开始时间倒推的
 * 一次性提醒，所以去重要靠 sent_at 而不是日期。
 *
 * 触发同样由外部 cron 打 /api/v1/cron/activity-reminders 驱动，
 * 建议与 daily-reminders 一起每 10 分钟跑一次。
 */

export const LEAD_OPTIONS = [30, 120, 1440, 4320] as const;
export const LEAD_LABEL: Record<number, string> = {
  30: '开始前 30 分钟',
  120: '开始前 2 小时',
  1440: '开始前 1 天',
  4320: '开始前 3 天',
};

const DEFAULT_LEAD = 1440;

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await exec(`CREATE TABLE IF NOT EXISTS activity_reminders (
    id           CHAR(36) NOT NULL PRIMARY KEY,
    user_id      CHAR(36) NOT NULL,
    activity_id  CHAR(36) NOT NULL,
    lead_minutes INT      NOT NULL DEFAULT 1440,
    notify_at    DATETIME NOT NULL,
    sent_at      DATETIME NULL,
    created_at   DATETIME NOT NULL,
    UNIQUE KEY uk_ar_user_activity (user_id, activity_id),
    KEY idx_ar_due (sent_at, notify_at),
    CONSTRAINT fk_ar_user     FOREIGN KEY (user_id)     REFERENCES users (id)      ON DELETE CASCADE,
    CONSTRAINT fk_ar_activity FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ensured = true;
}

const normLead = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_LEAD;
  return (LEAD_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_LEAD;
};

export interface ReminderItem {
  id: string;
  activityId: string;
  title: string;
  date: string;
  startTime: string;
  location: string;
  leadMinutes: number;
  notifyAt: string;
  sent: boolean;
}

/**
 * 订阅/改提醒。同一活动同一人只保留一条（uk_ar_user_activity），
 * 重复设置等于改提前量 —— 前端是单选，不需要先删再建。
 */
export async function setReminder(
  userId: string,
  activityId: string,
  leadRaw: unknown
): Promise<ReminderItem> {
  await ensureTable();
  const lead = normLead(leadRaw);

  const act = await one<{ id: string; title: string; start_at: any; status: string }>(
    `SELECT id, title, start_at, status FROM activities WHERE id = ?`,
    [activityId]
  );
  if (!act) throw new HttpError(404, 'NOT_FOUND', '活动不存在');
  if (String(act.status) !== 'published') throw new HttpError(422, 'VALIDATION_FAILED', '该活动不可订阅提醒');

  const row = await one<{ notify_at: string; started: number }>(
    `SELECT DATE_FORMAT(DATE_SUB(start_at, INTERVAL ? MINUTE), '%Y-%m-%d %H:%i:%s') AS notify_at,
            (start_at <= NOW()) AS started
     FROM activities WHERE id = ?`,
    [lead, activityId]
  );
  if (Number(row?.started)) throw new HttpError(422, 'ACTIVITY_STARTED', '活动已经开始，无法设置提醒');
  const notifyAt = String(row?.notify_at || '');
  if (!notifyAt) throw new HttpError(500, 'INTERNAL_ERROR', '提醒时间计算失败');

  await exec(
    `INSERT INTO activity_reminders (id, user_id, activity_id, lead_minutes, notify_at, created_at)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE lead_minutes = VALUES(lead_minutes), notify_at = VALUES(notify_at), sent_at = NULL`,
    [newId('armd'), userId, activityId, lead, notifyAt, ts()]
  );

  const saved = await one<any>(
    `SELECT r.id, r.lead_minutes, r.sent_at,
            DATE_FORMAT(r.notify_at, '%Y-%m-%d %H:%i') AS notify_at,
            a.title, a.location,
            DATE_FORMAT(a.start_at, '%Y-%m-%d') AS d,
            DATE_FORMAT(a.start_at, '%H:%i')    AS t
     FROM activity_reminders r JOIN activities a ON a.id = r.activity_id
     WHERE r.user_id = ? AND r.activity_id = ?`,
    [userId, activityId]
  );
  return {
    id: String(saved.id),
    activityId,
    title: String(saved.title || ''),
    date: String(saved.d || ''),
    startTime: String(saved.t || ''),
    location: String(saved.location || ''),
    leadMinutes: Number(saved.lead_minutes) || lead,
    notifyAt: String(saved.notify_at || ''),
    sent: !!saved.sent_at,
  };
}

/** 取消提醒（幂等） */
export async function clearReminder(userId: string, activityId: string): Promise<boolean> {
  await ensureTable();
  const res = await exec(`DELETE FROM activity_reminders WHERE user_id = ? AND activity_id = ?`, [
    userId,
    activityId,
  ]);
  return Number(res?.affectedRows || 0) > 0;
}

/**
 * 我的提醒列表。
 * @param upcoming 只看「活动还没开始」的（已过期的自动不展示，前端也就不用清理）
 */
export async function listReminders(userId: string, upcoming = true): Promise<ReminderItem[]> {
  await ensureTable();
  const rows = await q<any>(
    `SELECT r.id, r.activity_id, r.lead_minutes, r.sent_at,
            DATE_FORMAT(r.notify_at, '%Y-%m-%d %H:%i') AS notify_at,
            a.title, a.location,
            DATE_FORMAT(a.start_at, '%Y-%m-%d') AS d,
            DATE_FORMAT(a.start_at, '%H:%i')    AS t
     FROM activity_reminders r JOIN activities a ON a.id = r.activity_id
     WHERE r.user_id = ? ${upcoming ? 'AND a.start_at > NOW()' : ''}
     ORDER BY a.start_at ASC
     LIMIT 200`,
    [userId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    activityId: String(r.activity_id),
    title: String(r.title || ''),
    date: String(r.d || ''),
    startTime: String(r.t || ''),
    location: String(r.location || ''),
    leadMinutes: Number(r.lead_minutes) || DEFAULT_LEAD,
    notifyAt: String(r.notify_at || ''),
    sent: !!r.sent_at,
  }));
}

/** 给日历接口用：某用户对一批活动的提醒状态 */
export async function reminderMapFor(userId: string, activityIds: string[]): Promise<Record<string, { leadMinutes: number; notifyAt: string; sent: boolean }>> {
  const out: Record<string, { leadMinutes: number; notifyAt: string; sent: boolean }> = {};
  if (!userId) return out;
  const ids = Array.from(new Set((activityIds || []).map((x) => String(x || '').trim()).filter(Boolean)));
  if (!ids.length) return out;
  await ensureTable();
  const ph = ids.map(() => '?').join(',');
  const rows = await q<any>(
    `SELECT activity_id, lead_minutes, sent_at,
            DATE_FORMAT(notify_at, '%Y-%m-%d %H:%i') AS notify_at
     FROM activity_reminders WHERE user_id = ? AND activity_id IN (${ph})`,
    [userId, ...ids]
  );
  for (const r of rows) {
    out[String(r.activity_id)] = {
      leadMinutes: Number(r.lead_minutes) || DEFAULT_LEAD,
      notifyAt: String(r.notify_at || ''),
      sent: !!r.sent_at,
    };
  }
  return out;
}

export type ReminderRunResult = { scanned: number; sent: number; pushed: number; failed: number };

/**
 * 发送到点的活动提醒。
 *
 * 两个易踩的点：
 *  1) 时间判定必须留在 SQL 里用 NOW()。db.ts 的 ts() 生成的是 UTC 字面量，
 *     而 MySQL 会话时区是服务器本地时区，拿 JS 时间串去比 DATETIME 会整整差
 *     一个时区偏移 —— 提醒要么永不触发，要么提前 8 小时触发。
 *  2) 幂等：只扫 sent_at IS NULL 的行，发出后立刻标 sent_at。
 *     cron 会在窗口内跑多次，不标记就会重复骚扰。
 */
export async function runActivityReminders(_now?: Date, limit = 200): Promise<ReminderRunResult> {
  await ensureTable();
  const res: ReminderRunResult = { scanned: 0, sent: 0, pushed: 0, failed: 0 };

  const rows = await q<any>(
    `SELECT r.id, r.user_id, r.activity_id, r.lead_minutes,
            a.title, a.location, a.start_at,
            DATE_FORMAT(a.start_at, '%Y-%m-%d') AS d,
            DATE_FORMAT(a.start_at, '%H:%i')    AS t
     FROM activity_reminders r
     JOIN activities a ON a.id = r.activity_id
     WHERE r.sent_at IS NULL AND r.notify_at <= NOW() AND a.status = 'published'
     ORDER BY r.notify_at ASC
     LIMIT ?`,
    [limit]
  );
  res.scanned = rows.length;

  const label = (m: number) => LEAD_LABEL[m] || `开始前 ${m} 分钟`;

  for (const r of rows) {
    try {
      const payload = {
        title: '活动提醒',
        body: `《${String(r.title || '活动')}》将于 ${String(r.d || '')} ${String(r.t || '')} 开始（${label(
          Number(r.lead_minutes) || DEFAULT_LEAD
        )}）${r.location ? ` · ${String(r.location)}` : ''}`,
        link: `/activities/${String(r.activity_id)}`,
        tag: 'activity-reminder',
      };
      await notify(String(r.user_id), 'activity.reminder', payload.title, payload.body, payload.link);
      await exec(`UPDATE activity_reminders SET sent_at = NOW() WHERE id = ?`, [String(r.id)]);
      res.sent += 1;
      try {
        res.pushed += await sendPushToUser(String(r.user_id), payload);
      } catch {
        /* 推送失败不影响站内通知 */
      }
    } catch {
      res.failed += 1;
    }
  }

  return res;
}
