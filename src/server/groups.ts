import { exec, one } from '@/server/db';

/**
 * 团契归属处理（产品定稿规则）
 *
 * 触发场景：团长退出团契 / 团长账号被管理员删除。
 * 规则（按优先级）：
 *   1) 团契还有其他成员 → 把团长身份**自动移交给「最早入群」的成员**
 *      （joined_at 升序，同一时刻按 user_id 稳定排序，保证结果确定）；
 *   2) 团契只剩团长一人 → **自动解散**团契
 *      （删除 groups 行，group_members / group_posts 由外键级联清除）。
 *
 * 不做「团长退出即解散」：那会让一个几十人的团契因为一个人离开而整体消失，
 * 成员与历史动态一并丢失；也不允许「无主团契」长期存在。
 *
 * 注意：本函数**不删除** leftOwnerId 的 group_members 行——
 *   - 团长主动退出：由调用方（/groups/[id]/join DELETE）随后删除该成员行；
 *   - 团长账号被删除：由 users 的外键 ON DELETE CASCADE 自动清除。
 */
export type OwnerExitResult =
  | { action: 'transferred'; groupId: string; groupName: string; newOwnerId: string }
  | { action: 'dissolved'; groupId: string; groupName: string; newOwnerId: null }
  | { action: 'none'; groupId: string; groupName: string; newOwnerId: null };

export async function reassignOrDissolveGroup(
  groupId: string,
  leftOwnerId: string,
): Promise<OwnerExitResult> {
  const group = await one<any>(`SELECT id, name FROM \`groups\` WHERE id = ?`, [groupId]);
  if (!group) return { action: 'none', groupId, groupName: '', newOwnerId: null };

  const next = await one<any>(
    `SELECT user_id FROM group_members
      WHERE group_id = ? AND user_id <> ?
      ORDER BY joined_at ASC, user_id ASC LIMIT 1`,
    [groupId, leftOwnerId],
  );

  if (!next) {
    await exec(`DELETE FROM \`groups\` WHERE id = ?`, [groupId]);
    return { action: 'dissolved', groupId, groupName: group.name, newOwnerId: null };
  }

  await exec(`UPDATE \`groups\` SET owner_id = ? WHERE id = ?`, [next.user_id, groupId]);
  await exec(
    `UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?`,
    [groupId, next.user_id],
  );
  return { action: 'transferred', groupId, groupName: group.name, newOwnerId: next.user_id };
}

/**
 * 处理某用户拥有的全部团契：逐个移交或解散。
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
    results.push(await reassignOrDissolveGroup(g.id, userId));
  }
  return results;
}
