import crypto from 'node:crypto';
import { exec, one, q, newId, ts } from './db';
import { sendMail, smtpConfigured } from './channels/email';
import { hashPassword } from './auth';

/**
 * 忘记密码：邮件重置令牌
 *
 * 设计要点：
 * - 令牌只存 **哈希**（sha256），库被拖走也无法直接重置他人账号。
 * - 一次性：用掉即标记 used；同一用户再次申请会作废此前所有未用令牌。
 * - 短 TTL（默认 30 分钟）。
 * - **不泄露账号是否存在**：无论邮箱是否命中，接口都返回同一个"已发送"响应，
 *   只在真的命中时才发信（防用户枚举）。
 * - 未配置 SMTP 时接口返回明确错误，而不是假装成功。
 */

const TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MS || 30 * 60 * 1000);
/** 同一邮箱在窗口内最多申请次数，防邮件轰炸 */
const MAX_PER_WINDOW = 3;
const WINDOW_MS = 15 * 60 * 1000;

let checked = false;

export async function ensurePasswordResetTable(): Promise<void> {
  if (checked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS password_resets (
         id VARCHAR(40) PRIMARY KEY,
         user_id VARCHAR(40) NOT NULL,
         token_hash VARCHAR(64) NOT NULL,
         expires_at DATETIME NOT NULL,
         used TINYINT(1) NOT NULL DEFAULT 0,
         used_at DATETIME NULL,
         ip VARCHAR(64) DEFAULT '',
         created_at DATETIME NOT NULL,
         INDEX idx_pr_user (user_id),
         INDEX idx_pr_token (token_hash)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    checked = true;
  } catch {
    // 建表失败不致命：下面的查询会失败并返回友好提示
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function appName(): string {
  return process.env.MAIL_APP_NAME || '圣约社区';
}

/** 站点基址，用于拼重置链接。未配置时退化为空（前端可自行拼接）。 */
function baseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
}

/**
 * 申请重置：命中用户则发信。
 * @returns 永远返回成功语义（防枚举），sent 表示是否真的发了信（仅供服务端日志）
 */
export async function requestPasswordReset(
  email: string,
  ip: string
): Promise<{ sent: boolean }> {
  await ensurePasswordResetTable();

  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return { sent: false };

  const user = await one<{ id: string; email: string; display_name: string }>(
    `SELECT id, email, display_name FROM users WHERE LOWER(email)=? LIMIT 1`,
    [mail]
  );
  // 防枚举：邮箱不存在也返回 sent:true 的对外语义，但不发信
  if (!user) return { sent: false };

  if (!smtpConfigured()) {
    // 明确告知调用方：不是"已发送"，是发不出去
    const err: any = new Error('邮件服务未配置，无法发送重置邮件');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  // 窗口内限流
  const recent = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM password_resets WHERE user_id=? AND created_at > ?`,
    [user.id, ts(Date.now() - WINDOW_MS)]
  );
  if ((recent?.c || 0) >= MAX_PER_WINDOW) {
    const err: any = new Error('重置邮件申请过于频繁，请稍后再试');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  // 作废此前所有未使用令牌
  await exec(`UPDATE password_resets SET used=1, used_at=? WHERE user_id=? AND used=0`, [
    ts(),
    user.id,
  ]);

  const token = crypto.randomBytes(32).toString('base64url');
  const id = newId('pr');
  await exec(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used, ip, created_at)
     VALUES (?,?,?,?,0,?,?)`,
    [id, user.id, sha256(token), ts(Date.now() + TTL_MS), (ip || '').slice(0, 64), ts()]
  );

  const link = `${baseUrl()}/reset?token=${encodeURIComponent(token)}`;
  const minutes = Math.round(TTL_MS / 60000);
  const name = user.display_name || '弟兄姊妹';

  await sendMail({
    to: user.email,
    subject: `【${appName()}】重置密码`,
    text:
      `${name} 你好：\n\n` +
      `我们收到了重置你账号密码的请求。请打开下面的链接设置新密码（${minutes} 分钟内有效，仅能使用一次）：\n\n` +
      `${link}\n\n` +
      `如果这不是你本人操作，请忽略本邮件，你的密码不会改变。\n\n` +
      `${appName()}`,
    html:
      `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;color:#1f2937">` +
      `<p>${escapeHtml(name)} 你好：</p>` +
      `<p>我们收到了重置你账号密码的请求。请点击下面的按钮设置新密码：</p>` +
      `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background:#8B5E3C;color:#fff;text-decoration:none;border-radius:8px">重置密码</a></p>` +
      `<p style="color:#6b7280;font-size:13px">链接 ${minutes} 分钟内有效，仅能使用一次。<br>若按钮无法点击，请复制此链接到浏览器打开：<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>` +
      `<p style="color:#6b7280;font-size:13px">如果这不是你本人操作，请忽略本邮件，你的密码不会改变。</p>` +
      `<p style="color:#9ca3af;font-size:12px">${escapeHtml(appName())}</p>` +
      `</div>`,
  });

  return { sent: true };
}

/** 校验令牌是否有效（不消费）。用于前端在填新密码前先探活。 */
export async function verifyResetToken(token: string): Promise<boolean> {
  await ensurePasswordResetTable();
  const t = String(token || '').trim();
  if (!t) return false;
  const row = await one<{ id: string }>(
    `SELECT id FROM password_resets
      WHERE token_hash=? AND used=0 AND expires_at > ? LIMIT 1`,
    [sha256(t), ts()]
  );
  return !!row;
}

/**
 * 用令牌设置新密码：成功后作废该令牌，并吊销该用户全部会话（强制重新登录）。
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ ok: true }> {
  await ensurePasswordResetTable();

  const t = String(token || '').trim();
  if (!t) throw new Error('重置链接无效');
  if (!newPassword || newPassword.length < 6) throw new Error('新密码至少 6 位');

  const row = await one<{ id: string; user_id: string; expires_at: any }>(
    `SELECT id, user_id, expires_at FROM password_resets
      WHERE token_hash=? AND used=0 LIMIT 1`,
    [sha256(t)]
  );
  if (!row) throw new Error('重置链接无效或已被使用');
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('重置链接已过期，请重新申请');
  }

  await exec(`UPDATE users SET password_hash=? WHERE id=?`, [hashPassword(newPassword), row.user_id]);
  await exec(`UPDATE password_resets SET used=1, used_at=? WHERE id=?`, [ts(), row.id]);
  // 密码已改，所有登录态作废
  await exec(`UPDATE sessions SET revoked=1 WHERE user_id=?`, [row.user_id]);
  // 清理该用户剩余未用令牌
  await exec(`UPDATE password_resets SET used=1, used_at=? WHERE user_id=? AND used=0`, [
    ts(),
    row.user_id,
  ]);

  return { ok: true };
}

/** 清理过期令牌（供 cron/管理接口调用） */
export async function purgeExpiredResets(): Promise<number> {
  await ensurePasswordResetTable();
  const r = await exec(`DELETE FROM password_resets WHERE expires_at < ? OR used=1`, [
    ts(Date.now() - 7 * 24 * 3600 * 1000),
  ]);
  return r?.affectedRows || 0;
}

export async function countActiveResets(userId: string): Promise<number> {
  await ensurePasswordResetTable();
  const r = await q<{ c: number }>(
    `SELECT COUNT(*) AS c FROM password_resets WHERE user_id=? AND used=0 AND expires_at > ?`,
    [userId, ts()]
  );
  return r[0]?.c || 0;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}
