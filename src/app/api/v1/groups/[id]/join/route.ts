import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, conflict } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit, dispatchOutbox, emit, notify } from '@/server/services';
import { reassignOrDissolveGroup } from '@/server/groups';

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

/**
 * 退出团契。
 * - 普通成员：直接退出。
 * - 团长（owner）：按团契归属规则处理 —— 有其他成员则**自动移交给最早入群者**并退出；
 *   只剩自己一人则**解散整个团契**。想保留团契请改用 /groups/[id]/dissolve 显式解散，
 *   或用移交接口换团长后再退出。
 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const groupId = ctx.params.id;
  const own = await one<any>(
    `SELECT g.name, m.role FROM group_members m JOIN \`groups\` g ON g.id = m.group_id
      WHERE m.group_id = ? AND m.user_id = ?`,
    [groupId, user.id],
  );
  if (!own) throw notFound('你不在这个团契');

  if (own.role === 'owner') {
    const res = await reassignOrDissolveGroup(groupId, user.id);

    if (res.action === 'dissolved') {
      await emit('group.dissolved', { groupId, actorId: user.id, actorName: user.display_name });
      await dispatchOutbox();
      await audit(user.id, 'GROUP_DISSOLVE', 'group', groupId, `团长退出，团契《${own.name}》已解散`, '');
      return ok({ joined: false, memberCount: 0, dissolved: true, transferred: false, newOwnerId: null });
    }

    // 移交成功：清掉自己的成员行
    await exec(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
    await notify(
      res.newOwnerId,
      'group_owner',
      '👑 你已成为团契团长',
      `「${own.name}」原团长已退出，团长身份已自动移交给你，请继续带领这个团契。`,
      `/groups/${groupId}`,
    );
    await emit('group.owner_transferred', {
      groupId, actorId: user.id, actorName: user.display_name, newOwnerId: res.newOwnerId,
    });
    await dispatchOutbox();
    await audit(user.id, 'GROUP_LEAVE_OWNER', 'group', groupId,
      `团长退出《${own.name}》，团长移交给 ${res.newOwnerId}`, '');

    const count = await one<any>(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?`, [groupId]);
    return ok({
      joined: false,
      memberCount: Number(count?.c || 0),
      dissolved: false,
      transferred: true,
      newOwnerId: res.newOwnerId,
    });
  }

  await exec(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
  await audit(user.id, 'GROUP_LEAVE', 'group', groupId, `退出团契《${own.name}》`, '');
  const count = await one<any>(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?`, [groupId]);
  return ok({ joined: false, memberCount: Number(count?.c || 0), dissolved: false, transferred: false, newOwnerId: null });
});
