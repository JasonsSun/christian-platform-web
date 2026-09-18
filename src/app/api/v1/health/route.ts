import { NextRequest } from 'next/server';
import { getPool, q } from '@/server/db';
import { ok, fail, withApi } from '@/server/http';
import { cacheGetOrSet } from '@/server/cache';

export const dynamic = 'force-dynamic';

/**
 * 探活接口被监控/负载均衡高频轮询，而统计里 bible_verses 有 3 万多行，
 * 每次 COUNT(*) 都要扫一遍。这里缓存 60 秒：
 * DB 不可用时 cacheGetOrSet 不写缓存，下一次探测仍会真实打到数据库。
 */
const HEALTH_TTL_MS = 60_000;

export const GET = withApi(async (req: NextRequest) => {
  try {
    const payload = await cacheGetOrSet('health:summary', HEALTH_TTL_MS, async () => {
      await getPool();
      const rows = await q<any>('SELECT VERSION() AS v, DATABASE() AS db');
      const counts = await q<any>(
        `SELECT
          (SELECT COUNT(*) FROM users) users,
          (SELECT COUNT(*) FROM contents) contents,
          (SELECT COUNT(*) FROM activities) activities,
          (SELECT COUNT(*) FROM songs) songs,
          (SELECT COUNT(*) FROM bible_verses) verses,
          (SELECT COUNT(*) FROM notifications) notifications`
      );
      return {
        status: 'UP',
        database: { engine: 'MySQL', version: rows[0]?.v, schema: rows[0]?.db },
        counts: counts[0],
        time: new Date().toISOString(),
      };
    });
    return ok(payload);
  } catch (e: any) {
    return fail(503, 'DB_UNAVAILABLE', `数据库不可用: ${e.message}`);
  }
});
