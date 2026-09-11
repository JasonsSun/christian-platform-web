import { NextRequest } from 'next/server';
import { exec } from '@/server/db';
import { ok, withApi, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** DELETE /api/v1/friends/[id]  —— 解除好友关系 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const fid = ctx.params.id;
  if (fid === user.id) return ok({ ok: true });
  await exec(
    `DELETE FROM friend_requests
     WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status='accepted'`,
    [user.id, fid, fid, user.id]
  );
  await audit(user.id, 'friend.remove', 'user', fid, '', clientIp(req));
  return ok({ ok: true });
});
