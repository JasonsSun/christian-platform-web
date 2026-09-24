import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify, emit, dispatchOutbox } from '@/server/services';
import { requireModeratorModule } from '@/server/moderation';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** 后台·团契详情：基本信息 + 成员名单（管理端可查看任意团契的成员） */
export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  await requireModeratorModule(req, 'groups');
  const groupId = ctx.params.id;

  const group = await one<any>(
    `SELECT g.id, g.name, g.description, g.category, g.city, g.cover,
            DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS owner_id, u.display_name AS owner_name, u.username AS owner_username,
            u.avatar_color AS owner_color,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM group_posts p WHERE p.group_id = g.id) AS post_count
     FROM \`groups\` g LEFT JOIN users u ON u.id = g.owner_id
     WHERE g.id = ?`,
    [groupId],
  );
  if (!group) throw notFound('团契不存在');

  const members = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.city, u.status,
            m.role, DATE_FORMAT(m.joined_at,'%Y-%m-%dT%H:%i:%sZ') AS joined_at
     FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY FIELD(m.role,'owner','admin','member'), m.joined_at ASC`,
    [groupId],
  );

  return ok({
    id: group.id,
    name: group.name,
    description: group.description,
    category: group.category,
    city: group.city,
    cover: group.cover,
    createdAt: group.created_at,
    memberCount: Number(group.member_count || 0),
    postCount: Number(group.post_count || 0),
    owner: {
      id: group.owner_id,
      displayName: group.owner_name || '',
      username: group.owner_username || '',
      avatarColor: whiteSafeColor(group.owner_color || ''),
    },
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      avatarColor: whiteSafeColor(m.avatar_color),
      city: m.city,
      status: m.status,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  });
});

/**
 * 后台·团契调整（仅管理员）：
 *  - action=transferOwner + userId：把团长移交给指定成员
 *  - action=removeMember  + userId：把指定成员移出团契（不能移出团长，需先移交）
 */
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const groupId = ctx.params.id;
  const body = await readJson<{ action?: string; userId?: string }>(req);
  const action = body.action || '';
  const userId = body.userId || '';

  const group = await one<any>(`SELECT id, name, owner_id FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) throw notFound('团契不存在');
  if (!userId) throw new HttpError(400, 'BAD_REQUEST', '缺少 userId');

  const member = await one<any>(
    `SELECT m.role, u.display_name, u.username FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND m.user_id = ?`,
    [groupId, userId],
  );
  if (!member) throw notFound('该用户不在这个团契中');

  if (action === 'transferOwner') {
    if (userId === group.owner_id) throw new HttpError(400, 'BAD_REQUEST', 'TA 已经是团长了');
    await exec(`UPDATE \`groups\` SET owner_id = ? WHERE id = ?`, [userId, groupId]);
    await exec(`UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?`, [groupId, userId]);
    await exec(`UPDATE group_members SET role = 'member' WHERE group_id = ? AND user_id = ?`, [groupId, group.owner_id]);
    await notify(userId, 'group_owner', '你已成为团契团长',
      `管理员已将团契「${group.name}」的团长移交给你。`, `/groups/${groupId}`);
    if (group.owner_id) {
      await notify(group.owner_id, 'group_owner_changed', '团契团长已变更',
        `团契「${group.name}」的团长已由管理员移交给「${member.display_name || member.username}」。`, `/groups/${groupId}`);
    }
    await audit(admin.id, 'GROUP_TRANSFER_OWNER', 'group', groupId,
      `《${group.name}》团长移交给 ${userId}`, clientIp(req));
    return ok({ id: groupId, transferred: true, newOwnerId: userId });
  }

  if (action === 'removeMember') {
    if (member.role === 'owner' || userId === group.owner_id) {
      throw new HttpError(409, 'CONFLICT', '团长不能被移出，请先移交团长身份');
    }
    await exec(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, userId]);
    await notify(userId, 'group_removed', '你已被移出团契',
      `你已被管理员移出团契「${group.name}」。`, '/groups');
    await audit(admin.id, 'GROUP_REMOVE_MEMBER', 'group', groupId,
      `将 ${userId} 移出《${group.name}》`, clientIp(req));
    const count = await one<any>(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?`, [groupId]);
    return ok({ id: groupId, removed: true, memberCount: Number(count?.c || 0) });
  }

  throw new HttpError(422, 'VALIDATION_FAILED', '不支持的 action');
});

/** 后台·解散团契（仅管理员）：处置违规群组，不必等团长自己解散 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const groupId = ctx.params.id;

  const group = await one<any>(`SELECT id, name FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) throw notFound('团契不存在');

  const members = await q<any>(`SELECT user_id FROM group_members WHERE group_id = ?`, [groupId]);
  await exec(`DELETE FROM \`groups\` WHERE id = ?`, [groupId]);

  for (const m of members) {
    await notify(m.user_id, 'group_dissolved', '所属团契已被解散',
      `你所在的团契「${group.name}」因违反社区规范被平台管理员解散。`, '/groups');
  }
  await emit('group.dissolved', { groupId, actorId: admin.id, actorName: admin.display_name });
  await dispatchOutbox();
  await audit(admin.id, 'GROUP_DISSOLVE', 'group', groupId,
    `管理员解散团契《${group.name}》`, clientIp(req));

  return ok({ id: groupId, dissolved: true });
});
