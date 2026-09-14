import { exec, one } from '@/server/db';

/**
 * 团契归属处理（产品定稿规则 v2）
 *
 * 【核心原则】
 * 团长只有「主动退出」这一种动作才会失去团契，并且**退出时必须指定去向**。
 * 「只剩团长一人」本身不是解散的理由——团长随时可以再拉人进来，
 * 就像刚建团时只有他一个人一样。
 *
 * 因此：
 *   - 新建团契 = 只有团长一人，团契正常存在，可以继续拉人；
 *   - 团长想离开时，若有其他成员 → 必须移交（默认移交给最早入群者）；
 *   - 团长想离开时，若没有其他成员 → 唯一选项是「退出并解散」；
 *   - 团长只要不退出，哪怕团里只有他一个人，团契也一直存在。
 *
 * 【自动处理的场景】仅一种：团长账号被管理员删除（人都不在了，无法征询意向）。
 *   此时按同样规则——有成员则移交给最早入群者，没成员则解散。
 */

export type OwnerExitMode = 'transfer' | 'dissolve';

export type OwnerExitResult =
  | { action: 'transferred'; groupId: string; groupName: string; newOwnerId: string }
  | { action: 'dissolved'; groupId: string; groupName: string; newOwnerId: null }
  | { action: 'none'; groupId: string; groupName: string; newOwnerId: null };

/** 团契里除某人之外，最早入群的那位（无则返回 null）。 */
export async function earliestOtherMember(
  groupId: string,
  excludeUserId: string,
): Promise<string | null> {
  const next = await one<any>(
    `SELECT user_id FROM group_members
      WHERE group_id = ? AND user_id <> ?
      ORDER BY joined_at ASC, user_id ASC LIMIT 1`,
    [groupId, excludeUserId],
  );
  return next ? next.user_id : null;
}

/**
 * 团长退出的两种去向（由调用方决定，前端会先让用户选）。
 *
 * @param mode 'transfer' = 移交给最早入群者（无其他成员时调用方应先拦下并改走 dissolve）
 *             'dissolve' = 解散整个团契
 *
 * 本函数**不删除** leftOwnerId 的 group_members 行：
 *   - 团长主动退出：由调用方（/groups/[id]/join DELETE）随后删除该成员行；
 *   - 团长账号被删除：由 users 的外键 ON DELETE CASCADE 自动清除。
 */
export async function exitGroupAsOwner(
  groupId: string,
  leftOwnerId: string,
  mode: OwnerExitMode,
): Promise<OwnerExitResult> {
  const group = await one<any>(`SELECT id, name FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) return { action: 'none', groupId, groupName: '', newOwnerId: null };

  if (mode === 'dissolve') {
    await exec(`DELETE FROM \`groups\` WHERE id = ?`, [groupId]);
    return { action: 'dissolved', groupId, groupName: group.name, newOwnerId: null };
  }

  const nextUserId = await earliestOtherMember(groupId, leftOwnerId);
  if (!nextUserId) {
    // 没有人可以接手 —— 移交落空，按解散处理（调用方本该拦住）
    await exec(`DELETE FROM \`groups\` WHERE id = ?`, [groupId]);
    return { action: 'dissolved', groupId, groupName: group.name, newOwnerId: null };
  }

  await exec(`UPDATE \`groups\` SET owner_id = ? WHERE id = ?`, [nextUserId, groupId]);
  await exec(
    `UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?`,
    [groupId, nextUserId],
  );
  return { action: 'transferred', groupId, groupName: group.name, newOwnerId: nextUserId };
}

/**
 * 无需征询意向时的自动处理：有成员则移交最早入群者，无成员则解散。
 * 仅用于「团长账号被删除」这类人已离场、无法选择的场景。
 */
export async function autoReassignOrDissolve(
  groupId: string,
  leftOwnerId: string,
): Promise<OwnerExitResult> {
  const nextUserId = await earliestOtherMember(groupId, leftOwnerId);
  return exitGroupAsOwner(groupId, leftOwnerId, nextUserId ? 'transfer' : 'dissolve');
}

/**
 * 处理某用户拥有的全部团契：逐个自动移交或解散。
 * 每处理一个，该团契 owner_id 就变化（或整行被删），下次查询自然取到下一个，
 * 因此无需分页。返回明细，供审计/通知使用。
 */
export async function reassignAllOwnedGroups(userId: string): Promise<OwnerExitResult[]> {
  const results: OwnerExitResult[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const g = await one<any>(
      `SELECT id FROM \`groups\` WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1`,
      [userId],
    );
    if (!g) break;
    results.push(await autoReassignOrDissolve(g.id, userId));
  }
  return results;
}
