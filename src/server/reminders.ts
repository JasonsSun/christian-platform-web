import { exec, q } from './db';
import { ensureReminderColumns } from './reminderColumns';
import { notify } from './services';
import { sendPushToUser } from './webpush';

/**
 * 每日提醒。
 *
 * 项目此前有完整的通知基础设施(notify -> 站内 + 邮件/微信/短信队列),
 * 但缺少「谁来触发」这一环:没有任何定时任务会主动唤醒用户。
 * 这里补的就是这个触发源 —— 由外部 cron 打 /api/v1/cron/daily-reminders 驱动。
 *
 * 两个必须做对的点:
 * 1. 时区。服务器通常跑 UTC,提醒必须按北京时间判定,否则国内用户会在错误时间被叫醒。
 * 2. 幂等。cron 每 10 分钟跑一次,同一个人同一天只能被提醒一次,
 *    靠 remind_*_done 记录日期实现 —— 定时任务的执行时刻无法保证精确对齐,
 *    所以用「30 分钟窗口 + 日期去重」而不是精确相等。
 */

const TZ = 'Asia/Shanghai';
const WINDOW_MIN = 30;

const pad = (v: string | number) => String(v).padStart(2, '0');

/** 取指定时刻的北京时间:日期(YYYY-MM-DD)、HH:mm、当日分钟数 */
export function nowInZone(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${pad(p.hour)}:${pad(p.minute)}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

const toMin = (hhmm: string) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 到点判定:处于 [目标时刻, 目标+30分钟) 窗口内 */
export function isDue(targetHHmm: string, nowMinutes: number): boolean {
  const t = toMin(targetHHmm);
  return nowMinutes >= t && nowMinutes < t + WINDOW_MIN;
}

/**
 * 把列值还原成北京时间日期再比对。
 *
 * 坑:mysql2 会把 DATE 列读成「UTC 午夜」的 Date 对象,而这里比对的基准是北京时间。
 * 直接按本地时区取年月日的话,部署到 UTC 服务器时会算成前一天 —— 于是判定
 * 「今天还没发过」,用户每天被重复打扰。所以 Date 一律按 TZ 重新格式化。
 */
function dayKey(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) {
    const p: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(v)) {
      p[part.type] = part.value;
    }
    return `${p.year}-${p.month}-${p.day}`;
  }
  return String(v).slice(0, 10);
}

function sameDay(v: unknown, date: string): boolean {
  return !!v && dayKey(v) === date;
}

async function markSent(column: 'remind_read_done' | 'remind_devotion_done', userId: string, date: string) {
  try {
    await exec(`UPDATE notification_prefs SET ${column}=? WHERE user_id=?`, [date, userId]);
  } catch {
    /* 标记失败不影响本次已发出的提醒 */
  }
}

export type ReminderRunResult = {
  scanned: number; readSent: number; devotionSent: number; pushed: number; skipped: number;
};

/**
 * 扫描并发送当前到点的提醒。
 * @param now 注入时间便于测试
 * @param limit 单次最大处理人数,防止用户量大时单次请求拖太久
 */
export async function runDueReminders(now: Date = new Date(), limit = 500): Promise<ReminderRunResult> {
  await ensureReminderColumns();
  const { date, minutes } = nowInZone(now);
  const res: ReminderRunResult = { scanned: 0, readSent: 0, devotionSent: 0, pushed: 0, skipped: 0 };

  let rows: Array<{
    user_id: string;
    remind_read_at: string | null;
    remind_devotion_at: string | null;
    remind_read_done: unknown;
    remind_devotion_done: unknown;
  }> = [];
  try {
    rows = await q(
      `SELECT p.user_id, p.remind_read_at, p.remind_devotion_at,
              p.remind_read_done, p.remind_devotion_done
         FROM notification_prefs p
         JOIN users u ON u.id = p.user_id
        WHERE p.remind_enabled = 1 AND u.status = 'active'
        LIMIT ?`,
      [limit]
    );
  } catch {
    return res;
  }
  res.scanned = rows.length;

  for (const r of rows) {
    const readDue = isDue(r.remind_read_at || '06:30', minutes) && !sameDay(r.remind_read_done, date);
    const devoDue = isDue(r.remind_devotion_at || '21:30', minutes) && !sameDay(r.remind_devotion_done, date);
    if (!readDue && !devoDue) {
      res.skipped += 1;
      continue;
    }

    if (readDue) {
      const payload = {
        title: '今天的经文等你',
        body: '花几分钟读今天的经文并打个卡，日积月累会有惊喜。',
        link: '/plans',
        tag: 'reminder-read',
      };
      await notify(r.user_id, 'reminder.read', payload.title, payload.body, payload.link);
      await markSent('remind_read_done', r.user_id, date);
      res.readSent += 1;
      try {
        res.pushed += await sendPushToUser(r.user_id, payload);
      } catch {
        /* 推送失败不影响站内通知 */
      }
    }

    if (devoDue) {
      const payload = {
        title: '今天安静一会儿',
        body: '记录下今天的感恩、祈求或一点得着，哪怕只有一句话。',
        link: '/devotions',
        tag: 'reminder-devotion',
      };
      await notify(r.user_id, 'reminder.devotion', payload.title, payload.body, payload.link);
      await markSent('remind_devotion_done', r.user_id, date);
      res.devotionSent += 1;
      try {
        res.pushed += await sendPushToUser(r.user_id, payload);
      } catch {
        /* ignore */
      }
    }
  }

  return res;
}
