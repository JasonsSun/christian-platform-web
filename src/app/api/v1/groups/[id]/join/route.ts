import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, conflict, HttpError, readJson } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit, dispatchOutbox, emit, notify } from '@/server/services';
import { earliestOtherMember, exitGroupAsOwner, OwnerExitMode } from '@/server/groups';

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
 * - 团长（owner）：**必须显式选择去向**（body.mode = 'transfer' | 'dissolve'）：
 *     · transfer —— 移交给最早入群的成员（默认、推荐）；
 *     · dissolve —— 解散整个团契（连带成员与动态，不可恢复）。
 *   只有团长一人时，没有可移交对象 → 只允许 dissolve（前端会只给这一个选项并弹框确认）。
 *
 * 注意：团长不会因为「只剩自己一人」而被系统自动解散——他随时可以再拉人。
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
    const body = await readJson<{ mode?: string }>(req).catch(() => ({ mode: '' }));
    const successor = await earliestOtherMember(groupId, user.id);
    const hasSuccessor = !!successor;

    let mode = body.mode as OwnerExitMode | undefined;
    if (!mode) {
      // 未指定去向：有接任者默认移交（老前端兼容），否则只能解散
      mode = hasSuccessor ? 'transfer' : 'dissolve';
    }
    if (mode !== 'transfer' && mode !== 'dissolve') {
      throw new HttpError(422, 'VALIDATION_FAILED', 'mode 只能是 transfer 或 dissolve');
    }
    if (mode === 'transfer' && !hasSuccessor) {
      throw new HttpError(409, 'NO_SUCCESSOR', '团契中只有你一人，没有可移交的对象，请选择解散团契');
    }

    // 解散前先取出成员名单，用于事后通知（删除后级联清除就查不到了）
    const membersToNotify = mode === 'dissolve'
      ? (await q<any>(`SELECT user_id FROM group_members WHERE group_id = ?`, [groupId]))
          .map((m) => m.user_id as string)
          .filter((uid) => uid !== user.id)
      : [];

    const res = await exitGroupAsOwner(groupId, user.id, mode);

    if (res.action === 'dissolved') {
      for (const uid of membersToNotify) {
        await notify(uid, 'group_dissolved', '团契已解散',
          `你所在的团契「${own.name}」已被团长解散。`, '/groups');
      }
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
      '你已成为团契团长',
      `「${own.name}」原团长已退出，团长身份已移交给你，请继续带领这个团契。`,
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
