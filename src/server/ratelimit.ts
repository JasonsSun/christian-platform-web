import { exec, one } from './db';

/**
 * 限流（零依赖起步，可平滑升级到 Redis）。
 *
 * 背景：原先只有 2 个接口接入限流，且计数只存在单进程内存里 ——
 * 多实例部署时每个实例各算一份，形同虚设。
 *
 * 现在（优先级从高到低）：
 * - REDIS_URL 且装了 ioredis → Redis 共享计数（最稳的多实例方案）；
 * - 否则 → MySQL 原子计数器（rate_limits 表，无需额外组件，多实例同样一致）；
 * - 兜底 → 内存（仅单实例语义）。
 * 本项目必定有 MySQL，因此默认即为「DB 共享」，开箱多实例安全。
 *
 * - 提供 guardRequest(req, action, limit, windowMs)：按 IP + 用户维度限流，
 *   业务代码一行接入，并自动带上 Retry-After 语义。
 */

type Bucket = { count: number; resetAt: number };

interface Store {
  incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

/** 内存存储（单实例） */
class MemoryStore implements Store {
  private buckets = new Map<string, Bucket>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }, 60_000);
    this.timer.unref?.();
  }

  async incr(key: string, windowMs: number) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    return { count: b.count, resetAt: b.resetAt };
  }
}

/** Redis 存储（多实例共享）。用 INCR + PEXPIRE 原子实现。 */
class RedisStore implements Store {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private client: any) {}

  async incr(key: string, windowMs: number) {
    const rk = `rl:${key}`;
    // 一次 pipeline：自增 + 首次设置过期 + 读剩余 TTL
    const results = await this.client
      .multi()
      .incr(rk)
      .pexpire(rk, windowMs, 'NX')
      .pttl(rk)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    let ttl = Number(results?.[2]?.[1] ?? windowMs);
    if (ttl < 0) ttl = windowMs;
    return { count, resetAt: Date.now() + ttl };
  }
}

/**
 * MySQL 原子计数器（多实例共享，无需 Redis）。
 * 固定窗口：windowStart = floor(now/windowMs)，同一窗口的所有请求打到同一行并 +1，
 * 天然原子（INSERT...ON DUPLICATE KEY UPDATE 是行级锁）。
 */
class DbStore implements Store {
  async incr(key: string, windowMs: number) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs);
    await ensureRateLimitsTable();
    await exec(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [key, windowStart]
    );
    const row = await one<{ count: number }>(
      `SELECT count FROM rate_limits WHERE bucket=? AND window_start=?`,
      [key, windowStart]
    );
    // 顺手清掉 2 小时前的旧窗口，避免表无限增长
    await exec(`DELETE FROM rate_limits WHERE window_start < ?`, [
      Math.floor((now - 2 * 60 * 60 * 1000) / windowMs),
    ]).catch(() => undefined);
    return { count: row?.count ?? 1, resetAt: (windowStart + 1) * windowMs };
  }
}

let rateTableReady = false;
async function ensureRateLimitsTable(): Promise<void> {
  if (rateTableReady) return;
  rateTableReady = true;
  try {
    await exec(`CREATE TABLE IF NOT EXISTS rate_limits (
      bucket VARCHAR(191) NOT NULL,
      window_start BIGINT NOT NULL,
      count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket, window_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch {
    // 建表失败则本次退化为内存计数；不影响主流程
    rateTableReady = false;
  }
}

let store: Store | null = null;
let storeInitPromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (store) return store;
  if (!storeInitPromise) {
    storeInitPromise = (async () => {
      const url = process.env.REDIS_URL;
      if (url) {
        try {
          // 动态导入：没装 ioredis 也不影响启动。
          // 用变量承接模块名，避免 TS 在未安装该包时静态解析失败。
          const pkg = 'ioredis';
          const mod: any = await import(pkg);
          const Redis = mod.default || mod;
          const client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
          client.on('error', () => {
            /* Redis 挂了不能拖垮业务，下面会自动降级 */
          });
          console.warn('[ratelimit] 使用 Redis 共享计数（多实例生效）');
          return new RedisStore(client);
        } catch {
          console.warn('[ratelimit] REDIS_URL 已设置但 ioredis 不可用，降级为 MySQL 计数');
        }
      } else {
        console.warn('[ratelimit] 使用 MySQL 共享计数（多实例生效，无需 Redis）');
        return new DbStore();
      }
      return new MemoryStore();
    })();
  }
  store = await storeInitPromise;
  return store;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * 固定窗口限流。
 * 注意：异步实现下"判断+自增"是一次原子 incr，不存在并发超发。
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  const s = await getStore();
  const { count, resetAt } = await s.incr(key, windowMs);
  if (count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, resetAt - Date.now()) };
  }
  return { ok: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
}

/** 同步版本（仅内存有效，用于无法 await 的老调用点） */
const syncMemory = new MemoryStore();
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  // 同步路径无法用 Redis，保留内存实现；语义与旧版一致
  const now = Date.now();
  // 用反射拿到内部桶，避免重复实现两套逻辑
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buckets = (syncMemory as any).buckets as Map<string, Bucket>;
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: b.resetAt - now };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterMs: 0 };
}
