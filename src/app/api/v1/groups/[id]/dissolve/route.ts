import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, notFound, clientIp, HttpError } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notify, emit, dispatchOutbox } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * 解散团契。
 * 权限：团长本人，或平台管理员（管理员可解散任意团契，用于处置违规群组）。
 * 影响：删除团契本身，成员关系与团契动态由外键级联清除；会通知全部成员。
 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const groupId = ctx.params.id;

  const group = await one<any>(`SELECT id, name, owner_id FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) throw notFound('团契不存在');

  const isAdmin = user.role === 'admin';
  const isOwner = group.owner_id === user.id;
  if (!isAdmin && !isOwner) {
    throw new HttpError(403, 'FORBIDDEN', '只有团长本人或平台管理员可以解散团契');
  }

  // 解散前先取出成员，用于事后通知
  const members = await q<any>(`SELECT user_id FROM group_members WHERE group_id = ?`, [groupId]);

  await exec(`DELETE FROM \`groups\` WHERE id = ?`, [groupId]); // 级联清 group_members / group_posts

  for (const m of members) {
    if (m.user_id === user.id) continue;
    await notify(m.user_id, 'group_dissolved', '团契已解散',
      `你所在的团契「${group.name}」已被${isAdmin && !isOwner ? '平台管理员' : '团长'}解散。`, '/groups');
  }
  await emit('group.dissolved', { groupId, actorId: user.id, actorName: user.display_name });
  await dispatchOutbox();
  await audit(user.id, 'GROUP_DISSOLVE', 'group', groupId,
    `解散团契《${group.name}》（${isAdmin && !isOwner ? '管理员' : '团长'}操作）`, clientIp(req));

  return ok({ id: groupId, dissolved: true });
});
