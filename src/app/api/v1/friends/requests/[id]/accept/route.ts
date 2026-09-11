import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, conflict, forbidden, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { notify, audit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/v1/friends/requests/[id]/accept */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const id = ctx.params.id;
  const fr = await one<any>(`SELECT * FROM friend_requests WHERE id = ?`, [id]);
  if (!fr) throw notFound('好友申请不存在');
  if (fr.addressee_id !== user.id) throw forbidden('只能处理发给自己的申请');
  if (fr.status !== 'pending') throw conflict('该申请已被处理');

  await exec(`UPDATE friend_requests SET status='accepted', updated_at=? WHERE id=?`, [ts(), id]);
  const requester = await one<any>(`SELECT display_name FROM users WHERE id=?`, [fr.requester_id]);
  await notify(
    fr.requester_id,
    'friend_accepted',
    '好友申请已通过',
    `${user.display_name} 已接受你的好友申请`,
    '/friends?tab=friends'
  );
  await audit(user.id, 'friend.accept', 'user', fr.requester_id, '', clientIp(req));
  return ok({ ok: true, status: 'accepted' });
});
