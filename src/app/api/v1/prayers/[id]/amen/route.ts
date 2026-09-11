import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireUser } from '@/server/auth';
import { dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** 阿们(点赞代祷),幂等 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = ctx.params.id;
  const prayer = await one<any>(`SELECT id FROM prayers WHERE id = ?`, [id]);
  if (!prayer) throw notFound('代祷不存在');

  const exist = await one<any>(`SELECT 1 AS x FROM prayer_amens WHERE prayer_id = ? AND user_id = ?`, [id, user.id]);
  if (exist) {
    await exec(`DELETE FROM prayer_amens WHERE prayer_id = ? AND user_id = ?`, [id, user.id]);
    await exec(`UPDATE prayers SET amen_count = GREATEST(amen_count - 1, 0) WHERE id = ?`, [id]);
  } else {
    await exec(`INSERT INTO prayer_amens (prayer_id, user_id, created_at) VALUES (?,?,?)`, [id, user.id, ts()]);
    await exec(`UPDATE prayers SET amen_count = amen_count + 1 WHERE id = ?`, [id]);
    await emit('prayer.amen', { prayerId: id, actorId: user.id, actorName: user.display_name });
    await dispatchOutbox();
  }

  const row = await one<any>(`SELECT amen_count FROM prayers WHERE id = ?`, [id]);
  return ok({ amened: !exist, amenCount: Number(row?.amen_count || 0) });
});
