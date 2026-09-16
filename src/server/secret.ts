import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * 敏感配置（支付网关私钥/公钥/Secret）落库前的加密工具。
 *
 * 设计取舍：
 *  - 用 AES-256-GCM，带认证标签，密文被篡改会解密失败（不会悄悄存进错误密钥）。
 *  - 主密钥取自环境变量 SETTINGS_SECRET；未配置时用派生默认值，
 *    仅作为「防明文落库」的最低保障，生产务必设一个长随机值。
 *  - 存储格式：`enc:<iv base64>:<tag base64>:<ct base64>`，前缀便于判断是否需要解密。
 */

const ALGO = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function masterKey(): Buffer {
  const raw = process.env.SETTINGS_SECRET || 'christian-platform-default-settings-secret-do-not-use-in-prod';
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return payload; // 兼容非加密存法
  try {
    const [ivB64, tagB64, ctB64] = parts;
    const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 明文 → 可落库字符串（空值返回空串） */
export function packSecret(plain: string): string {
  const e = encryptSecret(plain);
  return e ? ENC_PREFIX + e : '';
}

/** 落库字符串 → 明文（非 enc: 前缀的原样返回，方便兼容老数据） */
export function unpackSecret(stored: string): string {
  if (!stored) return '';
  if (stored.startsWith(ENC_PREFIX)) return decryptSecret(stored.slice(ENC_PREFIX.length));
  return stored;
}
