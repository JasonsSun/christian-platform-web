import { q, one, exec, newId, ts } from './db';
import { ensureReminderColumns } from './reminderColumns';
import { sendMail, smtpConfigured } from './channels/email';
import { sendWechatTemplate, wechatConfigured } from './channels/wechat';

/* ==================== 通知偏好 ==================== */

export type DigestMode = 'realtime' | 'daily' | 'off';

export type NotificationPrefs = {
  inapp: boolean;
  email: boolean;
  wechat: boolean;
  sms: boolean;
  quietEnabled: boolean;
  quietFrom: string; // HH:mm
  quietTo: string; // HH:mm
  digest: DigestMode;
  /** 每日提醒总开关(读经 + 灵修)。关闭后不参与定时提醒扫描 */
  remindEnabled: boolean;
  remindReadAt: string; // 每日读经提醒时间 HH:mm
  remindDevotionAt: string; // 每日灵修提醒时间 HH:mm
};

export const DEFAULT_PREFS: NotificationPrefs = {
  inapp: true,
  email: false,
  wechat: false,
  sms: false,
  quietEnabled: false,
  quietFrom: '22:00',
  quietTo: '08:00',
  digest: 'realtime',
  remindEnabled: false,
  remindReadAt: '06:30',
  remindDevotionAt: '21:30',
};

type PrefRow = {
  inapp: number; email: number; wechat: number; sms: number;
  quiet_enabled: number; quiet_from: string; quiet_to: string; digest: string;
  remind_enabled?: number; remind_read_at?: string; remind_devotion_at?: string;
};

export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  await ensureReminderColumns();
  const row = await one<PrefRow>(`SELECT * FROM notification_prefs WHERE user_id=?`, [userId]);
  if (!row) return { ...DEFAULT_PREFS };
  return {
    inapp: !!row.inapp,
    email: !!row.email,
    wechat: !!row.wechat,
    sms: !!row.sms,
    quietEnabled: !!row.quiet_enabled,
    quietFrom: row.quiet_from || DEFAULT_PREFS.quietFrom,
    quietTo: row.quiet_to || DEFAULT_PREFS.quietTo,
    digest: (['realtime', 'daily', 'off'].includes(row.digest) ? row.digest : 'realtime') as DigestMode,
    // 老库补齐列之前这三列不存在,走默认值
    remindEnabled: !!row.remind_enabled,
    remindReadAt: /^\d{2}:\d{2}$/.test(row.remind_read_at || '') ? row.remind_read_at! : DEFAULT_PREFS.remindReadAt,
    remindDevotionAt: /^\d{2}:\d{2}$/.test(row.remind_devotion_at || '') ? row.remind_devotion_at! : DEFAULT_PREFS.remindDevotionAt,
  };
}

export async function savePrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const cur = await getPrefs(userId);
  const next: NotificationPrefs = {
    inapp: patch.inapp ?? cur.inapp,
    email: patch.email ?? cur.email,
    wechat: patch.wechat ?? cur.wechat,
    sms: patch.sms ?? cur.sms,
    quietEnabled: patch.quietEnabled ?? cur.quietEnabled,
    quietFrom: /^\d{2}:\d{2}$/.test(patch.quietFrom || '') ? patch.quietFrom! : cur.quietFrom,
    quietTo: /^\d{2}:\d{2}$/.test(patch.quietTo || '') ? patch.quietTo! : cur.quietTo,
    digest: patch.digest ?? cur.digest,
    remindEnabled: patch.remindEnabled ?? cur.remindEnabled,
    remindReadAt: /^\d{2}:\d{2}$/.test(patch.remindReadAt || '') ? patch.remindReadAt! : cur.remindReadAt,
    remindDevotionAt: /^\d{2}:\d{2}$/.test(patch.remindDevotionAt || '') ? patch.remindDevotionAt! : cur.remindDevotionAt,
  };
  await exec(
    `INSERT INTO notification_prefs
       (user_id, inapp, email, wechat, sms, quiet_enabled, quiet_from, quiet_to, digest,
        remind_enabled, remind_read_at, remind_devotion_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       inapp=VALUES(inapp), email=VALUES(email), wechat=VALUES(wechat), sms=VALUES(sms),
       quiet_enabled=VALUES(quiet_enabled), quiet_from=VALUES(quiet_from), quiet_to=VALUES(quiet_to),
       digest=VALUES(digest),
       remind_enabled=VALUES(remind_enabled), remind_read_at=VALUES(remind_read_at),
       remind_devotion_at=VALUES(remind_devotion_at), updated_at=VALUES(updated_at)`,
    [
      userId, next.inapp ? 1 : 0, next.email ? 1 : 0, next.wechat ? 1 : 0, next.sms ? 1 : 0,
      next.quietEnabled ? 1 : 0, next.quietFrom, next.quietTo, next.digest,
      next.remindEnabled ? 1 : 0, next.remindReadAt, next.remindDevotionAt, ts(),
    ]
  );
  return next;
}

/** 免打扰判定:支持跨零点区间(如 22:00 -> 08:00) */
export function inQuietHours(p: NotificationPrefs, now: Date = new Date()): boolean {
  if (!p.quietEnabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const from = toMin(p.quietFrom);
  const to = toMin(p.quietTo);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

/* ==================== 外发队列 ==================== */

type UserContact = {
  id: string;
  email: string;
  wechat_openid: string | null;
  phone: string;
  phone_verified: number;
};

async function contactOf(userId: string): Promise<UserContact | null> {
  return one<UserContact>(
    `SELECT id, email, wechat_openid, phone, phone_verified FROM users WHERE id=?`, [userId]
  );
}

/**
 * 站内通知写入后调用:按用户偏好把通知扇出到外部通道队列。
 * 只入队,不在此处真实投递(投递由 runNotifyJobs 消费),保证请求链路不被外部 IO 拖慢。
 */
export async function fanout(
  userId: string,
  kind: string,
  title: string,
  body: string,
  link = ''
): Promise<void> {
  if (!userId) return;
  try {
    const [prefs, user] = await Promise.all([getPrefs(userId), contactOf(userId)]);
    if (!user) return;
    if (prefs.digest === 'off') return;

    const jobs: Array<{ channel: string; to: string; reason?: string }> = [];
    if (prefs.email) {
      jobs.push(user.email
        ? { channel: 'email', to: user.email }
        : { channel: 'email', to: '', reason: 'no_email' });
    }
    if (prefs.wechat) {
      jobs.push(user.wechat_openid
        ? { channel: 'wechat', to: user.wechat_openid }
        : { channel: 'wechat', to: '', reason: 'wechat_not_bound' });
    }
    if (prefs.sms) {
      const okPhone = user.phone && user.phone_verified ? user.phone : '';
      jobs.push(okPhone ? { channel: 'sms', to: okPhone } : { channel: 'sms', to: '', reason: 'phone_unverified' });
    }

    for (const j of jobs) {
      await exec(
        `INSERT INTO notify_jobs
           (id, user_id, channel, kind, title, body, link, to_addr, status, reason, attempts, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
        [
          newId('njb'), userId, j.channel, kind, title.slice(0, 200), body.slice(0, 500), link.slice(0, 255),
          j.to, j.reason ? 'skipped' : 'pending', j.reason || '', ts(),
        ]
      );
    }
  } catch (e) {
    // 扇出失败绝不能影响主流程(站内通知已落库)
    console.error('[notify] fanout failed', userId, kind, e);
  }
}

/* ==================== 队列消费 ==================== */

const MAX_ATTEMPTS = 3;

export type DispatchResult = {
  scanned: number; sent: number; failed: number; skipped: number; deferred: number;
};

/** 消费外发队列。生产环境应由定时任务/消费者进程调用;这里也供管理员手动触发。 */
export async function runNotifyJobs(limit = 50): Promise<DispatchResult> {
  const res: DispatchResult = { scanned: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };
  const rows = await q<any>(
    `SELECT id, user_id, channel, kind, title, body, link, to_addr, attempts
     FROM notify_jobs WHERE status='pending' ORDER BY created_at LIMIT ?`,
    [limit]
  );
  res.scanned = rows.length;

  for (const job of rows) {
    // 免打扰:延迟到时段外再投,不标记为失败
    const prefs = await getPrefs(job.user_id);
    if (inQuietHours(prefs)) {
      res.deferred += 1;
      continue;
    }
    try {
      if (job.channel === 'email') {
        if (!smtpConfigured()) {
          await finish(job.id, 'skipped', 'smtp_not_configured');
          res.skipped += 1;
          continue;
        }
        await sendMail({ to: job.to_addr, subject: job.title, text: job.body });
      } else if (job.channel === 'wechat') {
        if (!wechatConfigured()) {
          await finish(job.id, 'skipped', 'wechat_not_configured');
          res.skipped += 1;
          continue;
        }
        await sendWechatTemplate(job.to_addr, job.kind, job.title, job.body, job.link);
      } else if (job.channel === 'sms') {
        await finish(job.id, 'skipped', 'sms_not_configured');
        res.skipped += 1;
        continue;
      } else {
        await finish(job.id, 'skipped', 'unknown_channel');
        res.skipped += 1;
        continue;
      }
      await finish(job.id, 'sent', '');
      res.sent += 1;
    } catch (e: any) {
      const attempts = Number(job.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await finish(job.id, 'failed', String(e?.message || 'send_failed').slice(0, 255));
        res.failed += 1;
      } else {
        await exec(`UPDATE notify_jobs SET attempts=?, reason=? WHERE id=?`,
          [attempts, String(e?.message || '').slice(0, 255), job.id]);
        res.deferred += 1;
      }
    }
  }
  return res;
}

async function finish(id: string, status: string, reason: string) {
  await exec(
    `UPDATE notify_jobs SET status=?, reason=?, attempts=attempts+1, processed_at=? WHERE id=?`,
    [status, reason, ts(), id]
  );
}

/** 管理员视角:队列健康度 */
export async function notifyQueueStats() {
  const rows = await q<{ status: string; channel: string; n: number }>(
    `SELECT status, channel, COUNT(*) n FROM notify_jobs GROUP BY status, channel`
  );
  const pending = rows.filter((r) => r.status === 'pending').reduce((a, b) => a + Number(b.n), 0);
  const failed = rows.filter((r) => r.status === 'failed').reduce((a, b) => a + Number(b.n), 0);
  const sent = rows.filter((r) => r.status === 'sent').reduce((a, b) => a + Number(b.n), 0);
  const skipped = rows.filter((r) => r.status === 'skipped').reduce((a, b) => a + Number(b.n), 0);
  return { pending, sent, failed, skipped, byChannel: rows };
}
