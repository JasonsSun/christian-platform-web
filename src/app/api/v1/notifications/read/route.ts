import { NextRequest } from 'next/server';
import { exec } from '@/server/db';
import { ok, withApi, readJson } from '@/server/http';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** POST { ids?: string[] } —— 不传 ids 表示全部已读 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<{ ids?: string[] }>(req).catch(() => ({}) as any);
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

  if (ids.length) {
    await exec(
      `UPDATE notifications SET \`read\` = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [user.id, ...ids]
    );
  } else {
    await exec(`UPDATE notifications SET \`read\` = 1 WHERE user_id = ?`, [user.id]);
  }
  return ok({ updated: true });
});
