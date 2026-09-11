/**
 * 内存固定窗口限流（零依赖，单进程内有效）。
 *
 * 用途：防止单个用户 / IP 高频刷接口（直播发消息、心跳等）把数据库打爆，
 * 是"直播间涌入大批量人"时的自保护手段。
 *
 * 注意：单实例有效。多实例水平扩展时必须改用 Redis 共享计数。
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** 固定窗口限流。key 区分维度（如 `chat:${userId}`、`beat:${session}`）。 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
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

/** 周期性清理过期桶，避免内存泄漏。 */
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000);
timer.unref?.();
