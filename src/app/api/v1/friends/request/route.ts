import { NextRequest } from 'next/server';
import { exec, one, newId, ts } from '@/server/db';
import { ok, withApi, notFound, conflict, badRequest, HttpError, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { notify, audit } from '@/server/services';
import { readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/v1/friends/request  { addresseeId, message? } */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const { addresseeId, message } = await readJson<{ addresseeId?: string; message?: string }>(req);
  if (!addresseeId) throw badRequest('缺少 addresseeId');
  if (addresseeId === user.id) throw new HttpError(400, 'BAD_REQUEST', '不能添加自己为好友');

  const target = await one<any>(`SELECT id, display_name FROM users WHERE id = ? AND status='active'`, [addresseeId]);
  if (!target) throw notFound('用户不存在');

  // 好友关系是双向的,必须两个方向都看,否则会产生「已互为好友却还能再发申请」的双向脏记录
  const [exist, incoming] = await Promise.all([
    one<any>(`SELECT id, status FROM friend_requests WHERE requester_id = ? AND addressee_id = ?`, [user.id, addresseeId]),
    one<any>(`SELECT id, status FROM friend_requests WHERE requester_id = ? AND addressee_id = ?`, [addresseeId, user.id]),
  ]);

  if (exist?.status === 'accepted' || incoming?.status === 'accepted') throw conflict('你们已经是好友');
  if (incoming?.status === 'pending') throw conflict('对方已向你发送好友申请,请到「好友申请」中处理');

  if (exist) {
    if (exist.status === 'pending') throw conflict('已发送好友申请,等待对方确认');
    // declined / cancelled -> 允许重新发送
    await exec(`UPDATE friend_requests SET status='pending', message=?, updated_at=? WHERE id=?`, [message || '', ts(), exist.id]);
    await notify(addresseeId, 'friend_request', '新的好友申请', `${user.display_name} 想加你为好友`, '/friends?tab=requests');
    await audit(user.id, 'friend.request', 'user', addresseeId, '', clientIp(req));
    return ok({ ok: true, requestId: exist.id, status: 'pending' });
  }

  const id = newId('fr');
  await exec(
    `INSERT INTO friend_requests (id, requester_id, addressee_id, message, status, created_at, updated_at) VALUES (?,?,?,?,'pending',?,?)`,
    [id, user.id, addresseeId, message || '', ts(), ts()]
  );
  await notify(addresseeId, 'friend_request', '新的好友申请', `${user.display_name} 想加你为好友`, '/friends?tab=requests');
  await audit(user.id, 'friend.request', 'user', addresseeId, '', clientIp(req));
  return ok({ ok: true, requestId: id, status: 'pending' });
});
