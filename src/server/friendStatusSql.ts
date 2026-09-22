/**
 * 「当前访客」与目标用户之间的好友关系状态 SQL 片段。
 *
 * 抽成一份是因为用户列表（/users）与用户详情（/users/[id]）必须给前端同一个口径：
 * 快捷卡片要在任意页面判断该显示「加好友」「已发送」还是「已加好友」，
 * 两处各写一遍 CASE 迟早漂移。
 *
 * 展开后按出现顺序共消耗 4 个 viewer.id 占位参数，且只在 FROM 里引用 `u.id`，
 * 因此宿主查询必须以 `users u` 为主表。
 */
export function friendStatusSql(hasViewer: boolean): string {
  if (!hasViewer) return "'none'";
  return `(
    SELECT CASE
      -- 只要存在 accepted 记录,双方即为好友(避免反向 pending 记录把状态盖回「已发送」)
      WHEN MAX(fr.status = 'accepted') = 1 THEN 'friends'
      WHEN MAX(fr.status = 'pending' AND fr.requester_id = ?) = 1 THEN 'pending_sent'
      WHEN MAX(fr.status = 'pending' AND fr.addressee_id = ?) = 1 THEN 'pending_received'
      ELSE 'none'
    END
    FROM friend_requests fr
    WHERE (fr.requester_id = ? AND fr.addressee_id = u.id) OR (fr.addressee_id = ? AND fr.requester_id = u.id)
  )`;
}
