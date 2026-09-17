import { exec, one, q, newId, ts } from './db';

/**
 * 团契群聊服务。
 * 表 group_messages 在 schema.sql 中通过 CREATE TABLE IF NOT EXISTS 在启动时幂等建好，
 * 这里只负责 CRUD 与成员权限校验。
 */

/** 是否团契成员（含团长） */
export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const r = await one<any>(
    `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
    [groupId, userId]
  );
  return !!r;
}

/** 团契团长 id（无则 null） */
export async function groupOwnerId(groupId: string): Promise<string | null> {
  const r = await one<any>(`SELECT owner_id FROM \`groups\` WHERE id = ?`, [groupId]);
  return r ? r.owner_id : null;
}

export async function addGroupMessage(
  groupId: string,
  userId: string,
  displayName: string,
  avatarColor: string | null,
  content: string
) {
  const id = newId('gm');
  await exec(
    `INSERT INTO group_messages (id, group_id, user_id, content, created_at)
     VALUES (?,?,?,?,?)`,
    [id, groupId, userId, content, ts()]
  );
  return one<any>(`SELECT * FROM group_messages WHERE id = ?`, [id]);
}

/**
 * 列出消息。since 之后增量拉取（用于轮询）；不传取最近 limit 条。
 * 返回字段统一 DATE_FORMAT，避免 JS Date 透出 ISO 串。
 */
export async function listGroupMessages(groupId: string, since?: string, limit = 200) {
  const params: any[] = [groupId];
  let extra = '';
  if (since) {
    extra = ' AND created_at > ?';
    params.push(since);
  }
  params.push(limit);
  return q<any>(
    `SELECT m.id, m.group_id, m.user_id, m.content,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name, u.avatar_color, u.username
       FROM group_messages m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ?${extra}
      ORDER BY m.created_at ASC LIMIT ?`,
    params
  );
}

/**
 * 删除群消息：仅作者本人或团长可删。
 * 返回 'deleted' | 'forbidden' | 'not_found'
 */
export async function deleteGroupMessage(
  groupId: string,
  msgId: string,
  userId: string
): Promise<'deleted' | 'forbidden' | 'not_found'> {
  const msg = await one<any>(
    `SELECT id, user_id FROM group_messages WHERE id = ? AND group_id = ?`,
    [msgId, groupId]
  );
  if (!msg) return 'not_found';
  if (msg.user_id === userId) {
    await exec(`DELETE FROM group_messages WHERE id = ?`, [msgId]);
    return 'deleted';
  }
  const owner = await groupOwnerId(groupId);
  if (owner === userId) {
    await exec(`DELETE FROM group_messages WHERE id = ?`, [msgId]);
    return 'deleted';
  }
  return 'forbidden';
}
