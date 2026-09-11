/**
 * 轻量内存缓存（零依赖，单进程内有效，进程重启即失效）。
 *
 * 用途：缓存读多写少的热点数据（直播间信息、在线人数、直播列表、首页聚合等），
 * 大幅降低对 MySQL 的直接读压力。
 *
 * 注意：仅在单实例 / 开发模式下足够。多实例水平扩展时必须改用 Redis 等共享缓存。
 */
type Entry = { v: unknown; exp: number };

const store = new Map<string, Entry>();

export function cacheGet<T = any>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.exp <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.v as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { v: value, exp: Date.now() + ttlMs });
}

export function cacheDel(key: string): void {
  store.delete(key);
}

export function cacheDelPrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** 读缓存，未命中则执行 fn 计算并回填；fn 抛错不写缓存。 */
export async function cacheGetOrSet<T = any>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const v = await fn();
  cacheSet(key, v, ttlMs);
  return v;
}
