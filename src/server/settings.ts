import { one } from './db';

/**
 * 系统运行配置读取（带 30 秒进程内缓存）。
 *
 * 配置项存放在 `settings` 表，由后台「系统设置」维护，种子数据见
 * `bin/migrate-settings-seed.mjs`。读取失败（表不存在 / DB 不可用）时
 * 一律回退到调用方给的默认值，绝不让配置层把业务请求打挂。
 */
const TTL_MS = 30_000;
const cache = new Map<string, { v: string; at: number }>();

/** 配置变更后清缓存（后台保存、迁移脚本都会调用） */
export function clearSettingsCache() {
  cache.clear();
}

export async function getSetting(key: string, def = ''): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  try {
    const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key_name = ?`, [key]);
    const v = row?.value ?? def;
    cache.set(key, { v, at: Date.now() });
    return v;
  } catch {
    return def;
  }
}

/** 布尔配置：'true' / '1' / 'yes' / 'on' 视为真 */
export async function getBool(key: string, def = false): Promise<boolean> {
  const raw = await getSetting(key, '');
  if (raw === '') return def;
  return /^(true|1|yes|on)$/i.test(raw.trim());
}

/** 数值配置：非法值回退默认 */
export async function getNumber(key: string, def = 0): Promise<number> {
  const raw = await getSetting(key, '');
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) ? n : def;
}

/** 一次取多个 key，返回 map（缺的用默认值） */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(keys.map(async (k) => { out[k] = await getSetting(k); }));
  return out;
}
