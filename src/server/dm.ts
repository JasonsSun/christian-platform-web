import { one } from '@/server/db';
import { HttpError } from '@/server/http';

export type DmPolicy = 'everyone' | 'followers' | 'none';

/**
 * 发送私信前的隐私策略校验。
 * 校验通过则静默返回；不通过则抛出 HttpError（由 withApi 统一收口为 403/404）。
 * 规则：
 *  - 双向拉黑（任意一方屏蔽另一方）一律禁止
 *  - 接收方 allow_dm = none          -> 拒绝
 *  - 接收方 allow_dm = followers     -> 发送方须已关注接收方
 *  - 接收方 allow_dm = everyone      -> 允许
 */
export async function canDm(senderId: string, receiverId: string): Promise<void> {
  if (senderId === receiverId) {
    throw new HttpError(400, 'BAD_REQUEST', '不能给自己发消息');
  }

  // 双向拉黑检查：屏蔽关系存在即拒绝（理由不区分是谁拉黑谁）
  const block = await one<any>(
    `SELECT 1 AS x FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
    [senderId, receiverId, receiverId, senderId]
  );
  if (block) {
    throw new HttpError(403, 'FORBIDDEN', '对方已设置不接受私信或已被屏蔽');
  }

  const receiver = await one<any>(`SELECT allow_dm FROM users WHERE id = ? LIMIT 1`, [receiverId]);
  if (!receiver) {
    throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  }

  const policy = (receiver.allow_dm || 'everyone') as DmPolicy;
  if (policy === 'none') {
    throw new HttpError(403, 'FORBIDDEN', '对方已设置不接受私信');
  }
  if (policy === 'followers') {
    const f = await one<any>(
      `SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ? LIMIT 1`,
      [senderId, receiverId]
    );
    if (!f) {
      throw new HttpError(403, 'FORBIDDEN', '对方仅接受粉丝私信，请先关注对方');
    }
  }
}
