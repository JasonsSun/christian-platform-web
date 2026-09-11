import { NextRequest } from 'next/server';
import { getPool, q } from '@/server/db';
import { ok, fail, withApi } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  try {
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
    return ok({
      status: 'UP',
      database: { engine: 'MySQL', version: rows[0]?.v, schema: rows[0]?.db },
      counts: counts[0],
      time: new Date().toISOString(),
    });
  } catch (e: any) {
    return fail(503, 'DB_UNAVAILABLE', `数据库不可用: ${e.message}`);
  }
});
