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

/**
 * 条目上限。Map 本身无界：站点变大后缓存 key 的基数也在涨
 * （经文章节 version×book×chapter 就有上千个组合），没有上限会缓慢吃满内存。
 * 超限时按插入顺序淘汰最早的一批（Map 保持插入序，等价于简易 FIFO/LRU 折中）。
 */
const MAX_ENTRIES = 2000;

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const drop = Math.ceil(MAX_ENTRIES * 0.1);
  let n = 0;
  for (const k of store.keys()) {
    if (n++ >= drop) break;
    store.delete(k);
  }
}

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
  evictIfNeeded();
}

/** 当前缓存条目数（健康检查 / 排障用） */
export function cacheSize(): number {
  return store.size;
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
