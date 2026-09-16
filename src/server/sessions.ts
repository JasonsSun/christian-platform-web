import { exec, one, q } from './db';
import type { UserRow } from './auth';

/**
 * 会话（登录设备）管理。
 *
 * sessions 表已存在，这里只幂等补一列 `last_seen_at`（记录该设备最近活跃时间），
 * 老库升级无需手动迁移。
 */

export interface SessionView {
  id: string;
  /** 是否为发起请求的这台设备 */
  current: boolean;
  /** 粗略设备名，由 UA 推断 */
  device: string;
  browser: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revoked: boolean;
}

let columnChecked = false;

async function ensureLastSeenColumn(): Promise<void> {
  if (columnChecked) return;
  try {
    await exec(`ALTER TABLE sessions ADD COLUMN last_seen_at DATETIME NULL`);
  } catch {
    // 列已存在（MySQL 1060）或表不存在，都忽略
  }
  columnChecked = true;
}

function parseDevice(ua: string): { device: string; browser: string } {
  const s = (ua || '').toLowerCase();
  let device = '未知设备';
  if (/iphone|ipad|ipod/.test(s)) device = /ipad/.test(s) ? 'iPad' : 'iPhone';
  else if (/android/.test(s)) device = /mobile/.test(s) ? 'Android 手机' : 'Android 平板';
  else if (/windows/.test(s)) device = 'Windows 电脑';
  else if (/macintosh|mac os/.test(s)) device = 'Mac 电脑';
  else if (/linux/.test(s)) device = 'Linux 电脑';

  let browser = '未知浏览器';
  if (/weixin|micromessenger/.test(s)) browser = '微信内置';
  else if (/qq\//.test(s)) browser = 'QQ 内置';
  else if (/weibo/.test(s)) browser = '微博内置';
  else if (/alipay/.test(s)) browser = '支付宝内置';
  else if (/edg\//.test(s)) browser = 'Edge';
  else if (/chrome\//.test(s)) browser = 'Chrome';
  else if (/safari\//.test(s) && !/chrome/.test(s)) browser = 'Safari';
  else if (/firefox\//.test(s)) browser = 'Firefox';

  return { device, browser };
}

/** 列出某用户未撤销且未过期的会话 */
export async function listSessions(
  user: UserRow,
  currentSid: string | null
): Promise<SessionView[]> {
  await ensureLastSeenColumn();

  const rows = await q<any>(
    `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at, revoked
       FROM sessions
      WHERE user_id=? AND revoked=0
      ORDER BY COALESCE(last_seen_at, created_at) DESC
      LIMIT 50`,
    [user.id]
  );

  const now = Date.now();
  return rows
    .filter((r) => new Date(r.expires_at).getTime() > now)
    .map((r) => {
      const { device, browser } = parseDevice(r.user_agent || '');
      return {
        id: r.id,
        current: !!currentSid && r.id === currentSid,
        device,
        browser,
        ip: r.ip || '',
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at || null,
        expiresAt: r.expires_at,
        revoked: !!r.revoked,
      };
    });
}

/** 更新当前会话的最近活跃时间（节流：同一次登录每 5 分钟最多写一次） */
export async function touchSession(sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  await ensureLastSeenColumn();
  try {
    await exec(
      `UPDATE sessions SET last_seen_at=?
        WHERE id=? AND (last_seen_at IS NULL OR last_seen_at < ?)`,
      [new Date().toISOString().slice(0, 19).replace('T', ' '), sessionId,
       new Date(Date.now() - 5 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')]
    );
  } catch {
    /* 会话已不存在等情况，忽略 */
  }
}

/**
 * 吊销指定会话。
 * @param excludeCurrent 为 true 时拒绝吊销当前设备（防止把自己踢下线后无法操作）
 */
export async function revokeSession(
  user: UserRow,
  sessionId: string,
  currentSid: string | null
): Promise<boolean> {
  await ensureLastSeenColumn();
  const row = await one<{ id: string }>(
    `SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked=0 LIMIT 1`,
    [sessionId, user.id]
  );
  if (!row) return false;
  if (currentSid && sessionId === currentSid) return false;

  await exec(`UPDATE sessions SET revoked=1 WHERE id=? AND user_id=?`, [sessionId, user.id]);
  return true;
}

/** 吊销该用户除当前设备外的所有会话，返回受影响条数 */
export async function revokeOtherSessions(user: UserRow, currentSid: string | null): Promise<number> {
  await ensureLastSeenColumn();
  const r = await exec(
    `UPDATE sessions SET revoked=1 WHERE user_id=? AND revoked=0${currentSid ? ' AND id<>?' : ''}`,
    currentSid ? [user.id, currentSid] : [user.id]
  );
  return r?.affectedRows || 0;
}
