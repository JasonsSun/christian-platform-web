import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, conflict } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit, dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const groupId = ctx.params.id;
  const group = await one<any>(`SELECT id, name FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) throw notFound('团契不存在');

  const exist = await one<any>(`SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
  if (exist) throw conflict('你已在该团契中');

  await exec(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`,
    [groupId, user.id, 'member', ts()]);
  await emit('group.joined', { groupId, actorId: user.id, actorName: user.display_name });
  await dispatchOutbox();
  await audit(user.id, 'GROUP_JOIN', 'group', groupId, `加入《${group.name}》`, '');

  const count = await one<any>(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?`, [groupId]);
  return ok({ joined: true, memberCount: Number(count?.c || 0) });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const groupId = ctx.params.id;
  const own = await one<any>(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
  if (!own) throw notFound('你不在这个团契');
  if (own.role === 'owner') throw conflict('创建者不能退出自己的团契');

  await exec(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
  await audit(user.id, 'GROUP_LEAVE', 'group', groupId, '退出团契', '');
  const count = await one<any>(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?`, [groupId]);
  return ok({ joined: false, memberCount: Number(count?.c || 0) });
});
