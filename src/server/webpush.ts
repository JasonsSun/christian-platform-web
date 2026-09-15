import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { exec, q, newId, ts } from './db';

/**
 * Web Push 通道。
 *
 * 重要前提:浏览器推送要经各自的推送服务中转 —— Chrome/Edge 走 Google FCM,
 * 国内网络通常连不上,因此本通道在国内大概率收不到。**它只是补充通道**,
 * 每日提醒的主链路是「站内通知 + 邮件 + 微信」(见 reminders.ts)。
 * 未配置 VAPID 时本模块所有函数安全降级为空操作,不留副作用。
 */

let tableChecked = false;
let vapidReady = false;

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh?: string; auth?: string };
};

/** 是否配置了可用凭证。前端据此决定是否展示「浏览器推送」开关 */
export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}

async function ensureVapid(): Promise<void> {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
  vapidReady = true;
}

/** 运行时幂等建表(与 devotionals.ts 同套路,老库免迁移) */
export async function ensurePushTable(): Promise<void> {
  if (tableChecked) return;
  tableChecked = true;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
         id            CHAR(36)     NOT NULL PRIMARY KEY,
         user_id       CHAR(36)     NOT NULL,
         endpoint      VARCHAR(500) NOT NULL,
         endpoint_hash CHAR(32)     NOT NULL,
         p256dh        VARCHAR(255) NOT NULL,
         auth          VARCHAR(255) NOT NULL,
         user_agent    VARCHAR(255) NOT NULL DEFAULT '',
         created_at    DATETIME     NOT NULL,
         UNIQUE KEY uk_push_user_hash (user_id, endpoint_hash),
         KEY idx_push_user (user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch {
    // 建表失败不阻断:推送缺失不影响站内通知
  }
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionInput,
  userAgent = ''
): Promise<boolean> {
  if (!pushConfigured()) return false;
  await ensurePushTable();
  const endpoint = String(sub?.endpoint || '').slice(0, 500);
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!endpoint || !p256dh || !auth) return false;
  try {
    await exec(
      `INSERT INTO push_subscriptions
         (id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent, created_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth),
         user_agent=VALUES(user_agent), created_at=VALUES(created_at)`,
      [newId('psb'), userId, endpoint, md5(endpoint), p256dh, auth, userAgent.slice(0, 255), ts()]
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeSubscription(userId: string, endpoint?: string): Promise<void> {
  if (!pushConfigured()) return;
  await ensurePushTable();
  try {
    if (endpoint) {
      await exec(`DELETE FROM push_subscriptions WHERE user_id=? AND endpoint_hash=?`, [
        userId,
        md5(endpoint),
      ]);
    } else {
      await exec(`DELETE FROM push_subscriptions WHERE user_id=?`, [userId]);
    }
  } catch {
    /* ignore */
  }
}

export async function countSubscriptions(userId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  await ensurePushTable();
  const row = await q<{ n: number }>(
    `SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?`,
    [userId]
  ).then((r) => r[0]).catch(() => undefined);
  return Number(row?.n || 0);
}

type SubRow = {
  id: string; endpoint: string; p256dh: string; auth: string;
};

/**
 * 给某用户的所有订阅发一条推送。返回实际成功送达数。
 * 过期订阅(410/404)会自动清理,避免僵尸端点拉低后续发送成功率。
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; link?: string; tag?: string }
): Promise<number> {
  if (!pushConfigured()) return 0;
  await ensurePushTable();
  await ensureVapid();
  let rows: SubRow[] = [];
  try {
    rows = await q<SubRow>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?`,
      [userId]
    );
  } catch {
    return 0;
  }
  let sent = 0;
  const dead: string[] = [];
  for (const r of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (e: any) {
      const code = Number(e?.statusCode || 0);
      // 404/410 = 订阅已失效(退订或浏览器清了),删掉以防反复重试
      if (code === 404 || code === 410) dead.push(r.id);
    }
  }
  for (const id of dead) {
    try {
      await exec(`DELETE FROM push_subscriptions WHERE id=?`, [id]);
    } catch {
      /* ignore */
    }
  }
  return sent;
}
