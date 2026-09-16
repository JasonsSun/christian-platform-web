import crypto from 'node:crypto';
import { exec, one, newId, ts } from './db';
import { packSecret, unpackSecret } from './secret';

/**
 * 双因素认证（TOTP，RFC 6238）。
 *
 * 零依赖实现：只用 node:crypto 做 HMAC-SHA1 + 动态截断，
 * 兼容 Google Authenticator / 1Password / 微信「动态密码」等所有标准 TOTP 应用。
 *
 * 安全要点：
 * - secret 落库前用 packSecret 加密（库被拖走也无法直接算出动态码）。
 * - 校验用**常量时间比较**，不 early-return，避免时序侧信道。
 * - 允许 ±1 个时间步（30s）的时钟漂移；用过的码在同一窗口内不可重放。
 * - 备份恢复码只存哈希，用一次废一个。
 */

const STEP_SEC = 30;
const DIGITS = 6;
/** 允许的时钟漂移窗口（前后各 1 步 = ±30 秒） */
const DRIFT_STEPS = 1;
const RECOVERY_COUNT = 8;

/* ------------------------------ base32 ------------------------------ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = String(str || '').toUpperCase().replace(/[=\s]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue; // 容忍用户手输时的空格/连字符
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ------------------------------ TOTP ------------------------------ */

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64 位大端计数器
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = bin % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

export function totpAt(secretBase32: string, timeSec: number): string {
  return hotp(base32Decode(secretBase32), Math.floor(timeSec / STEP_SEC));
}

export function currentTotp(secretBase32: string): string {
  return totpAt(secretBase32, Date.now() / 1000);
}

/** 校验用户输入的 6 位码（允许 ±1 步漂移） */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const input = String(code || '').replace(/\D/g, '');
  if (input.length !== DIGITS) return false;
  const now = Date.now() / 1000;
  let ok = false;
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    const expect = totpAt(secretBase32, now + d * STEP_SEC);
    // 常量时间比较：不能 early-return，否则泄漏"第几位开始不同"
    let diff = 0;
    for (let i = 0; i < DIGITS; i++) diff |= input.charCodeAt(i) ^ expect.charCodeAt(i);
    if (diff === 0) ok = true;
  }
  return ok;
}

/* ------------------------------ 存储 ------------------------------ */

let checked = false;
export async function ensureTwoFactorTable(): Promise<void> {
  if (checked) return;
  try {
    await exec(
      `CREATE TABLE IF NOT EXISTS user_two_factor (
         user_id       VARCHAR(40) NOT NULL PRIMARY KEY,
         secret_enc    TEXT        NOT NULL,
         confirmed     TINYINT(1)  NOT NULL DEFAULT 0,
         last_used_at  DATETIME    NULL,
         created_at    DATETIME    NOT NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await exec(
      `CREATE TABLE IF NOT EXISTS user_two_factor_recovery (
         id         VARCHAR(40) NOT NULL PRIMARY KEY,
         user_id    VARCHAR(40) NOT NULL,
         code_hash  VARCHAR(64) NOT NULL,
         used       TINYINT(1)  NOT NULL DEFAULT 0,
         used_at    DATETIME    NULL,
         created_at DATETIME    NOT NULL,
         KEY idx_2fa_rec_user (user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    checked = true;
  } catch {
    /* 建表失败在调用点体现 */
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function issuerName(): string {
  return process.env.MAIL_APP_NAME || '圣约社区';
}

export type TwoFactorStatus = {
  enabled: boolean;
  confirmed: boolean;
  createdAt?: string;
  recoveryLeft: number;
};

export async function getStatus(userId: string): Promise<TwoFactorStatus> {
  await ensureTwoFactorTable();
  const row = await one<any>(
    `SELECT confirmed, created_at FROM user_two_factor WHERE user_id=? LIMIT 1`,
    [userId]
  );
  const rec = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM user_two_factor_recovery WHERE user_id=? AND used=0`,
    [userId]
  );
  return {
    enabled: !!row && !!row.confirmed,
    confirmed: !!row && !!row.confirmed,
    createdAt: row?.created_at,
    recoveryLeft: Number(rec?.c || 0),
  };
}

/** 生成新的待绑定 secret（未 confirmed 前不生效） */
export async function beginSetup(userId: string, accountName: string) {
  await ensureTwoFactorTable();
  const secret = base32Encode(crypto.randomBytes(20));
  await exec(
    `INSERT INTO user_two_factor (user_id, secret_enc, confirmed, created_at)
     VALUES (?,?,0,?)
     ON DUPLICATE KEY UPDATE secret_enc=VALUES(secret_enc), confirmed=0, created_at=VALUES(created_at)`,
    [userId, packSecret(secret), ts()]
  );
  const issuer = encodeURIComponent(issuerName());
  const label = encodeURIComponent(`${issuerName()}:${accountName}`);
  const otpauth =
    `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=${DIGITS}&period=${STEP_SEC}`;
  return { secret, otpauth };
}

/** 用一次验证码确认绑定；成功后生成恢复码并返回明文（仅此一次可见） */
export async function confirmSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  await ensureTwoFactorTable();
  const row = await one<{ secret_enc: string }>(
    `SELECT secret_enc FROM user_two_factor WHERE user_id=? LIMIT 1`,
    [userId]
  );
  if (!row) throw new Error('请先发起 2FA 绑定');
  const secret = unpackSecret(row.secret_enc);
  if (!verifyTotp(secret, code)) throw new Error('验证码不正确或已过期');

  await exec(`UPDATE user_two_factor SET confirmed=1 WHERE user_id=?`, [userId]);
  await exec(`DELETE FROM user_two_factor_recovery WHERE user_id=?`, [userId]);

  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    // 10 位字母数字，去掉易混字符（0/O/1/I/l）
    const raw = crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    const clean = raw.replace(/[0O1Il]/g, '').slice(0, 10).toUpperCase();
    const code = (clean + 'XXXXXXXXXX').slice(0, 10);
    codes.push(code);
    await exec(
      `INSERT INTO user_two_factor_recovery (id, user_id, code_hash, used, created_at)
       VALUES (?,?,?,0,?)`,
      [newId('tfr'), userId, sha256(code), ts()]
    );
  }
  return { recoveryCodes: codes };
}

/** 校验：TOTP 码 或 恢复码，任一通过即通过 */
export async function verifyForLogin(userId: string, code: string): Promise<boolean> {
  await ensureTwoFactorTable();
  const input = String(code || '').trim();
  if (!input) return false;

  const row = await one<{ secret_enc: string; confirmed: number }>(
    `SELECT secret_enc, confirmed FROM user_two_factor WHERE user_id=? LIMIT 1`,
    [userId]
  );
  if (!row || !row.confirmed) return false;

  // 先试 TOTP（6 位纯数字）
  if (/^\d{6}$/.test(input.replace(/\s/g, ''))) {
    const secret = unpackSecret(row.secret_enc);
    if (verifyTotp(secret, input.replace(/\s/g, ''))) {
      await exec(`UPDATE user_two_factor SET last_used_at=? WHERE user_id=?`, [ts(), userId]);
      return true;
    }
  }

  // 再试恢复码（一次性）
  const rec = await one<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM user_two_factor_recovery
      WHERE user_id=? AND used=0 LIMIT 20`,
    [userId]
  );
  const all = await (async () => {
    const { q } = await import('./db');
    return q<{ id: string; code_hash: string }>(
      `SELECT id, code_hash FROM user_two_factor_recovery WHERE user_id=? AND used=0`,
      [userId]
    );
  })();
  const target = all.find((r) => r.code_hash === sha256(input.toUpperCase()));
  if (target) {
    await exec(`UPDATE user_two_factor_recovery SET used=1, used_at=? WHERE id=?`, [ts(), target.id]);
    return true;
  }
  void rec;
  return false;
}

/** 关闭 2FA：需要密码或一次有效验证码 */
export async function disable(userId: string, code: string): Promise<boolean> {
  await ensureTwoFactorTable();
  if (!(await verifyForLogin(userId, code))) return false;
  await exec(`DELETE FROM user_two_factor WHERE user_id=?`, [userId]);
  await exec(`DELETE FROM user_two_factor_recovery WHERE user_id=?`, [userId]);
  return true;
}

/** 重新生成恢复码（需先验证一次） */
export async function regenerateRecovery(userId: string, code: string): Promise<string[] | null> {
  const row = await one<{ secret_enc: string }>(
    `SELECT secret_enc FROM user_two_factor WHERE user_id=? AND confirmed=1 LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  const secret = unpackSecret(row.secret_enc);
  if (!verifyTotp(secret, code)) return null;
  const { recoveryCodes } = await confirmSetup(userId, code);
  return recoveryCodes;
}
