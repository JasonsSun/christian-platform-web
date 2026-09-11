'use client';

import { useActivityTracker } from '@/lib/useActivity';

/**
 * 全局活跃采集:统计「在线时长 + 使用次数」,作为成长画像与动态配额的依据。
 * - 每 30s 计时一次(仅页面可见时计入)
 * - 累计满 60s 或页面隐藏/关闭时上报(keepalive 保证关闭也能送达)
 */
export default function ActivityTracker() {
  useActivityTracker();
  return null;
}
