import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, notFound, forbidden } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit } from '@/server/services';
import { isModuleModerator } from '@/server/moderation';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string; commentId: string } };

/**
 * 删除评论
 * 允许的人：评论作者本人 / 该内容作者 / 「评论」模块审核员 / 管理员。
 * 评论模块审核员负责清理争吵、人身攻击与恶意刷屏；
 * 未被分配评论模块的审核员仍然没有删除权。
 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireUser(req);
  const id = ctx.params.id;
  const commentId = ctx.params.commentId;

  const row = await one<any>(
    `SELECT cm.id, cm.user_id, cm.content_id, cm.body, c.author_id, c.title
       FROM comments cm JOIN contents c ON c.id = cm.content_id
      WHERE cm.id = ? AND cm.content_id = ?`,
    [commentId, id]
  );
  if (!row) throw notFound('评论不存在或已被删除');

  const isAdmin = viewer.role === 'admin';
  const isCommentAuthor = row.user_id === viewer.id;
  const isContentAuthor = row.author_id === viewer.id;
  // 「评论」模块审核员可清理他人违规评论（管理员仍保留全模块权限）
  const byModule =
    !isCommentAuthor && !isContentAuthor && (await isModuleModerator(viewer, 'comments'));
  if (!isCommentAuthor && !isContentAuthor && !isAdmin && !byModule) {
    throw forbidden('只能删除自己的评论；清理他人评论需要「评论」模块审核员或管理员权限');
  }

  await exec(`DELETE FROM comments WHERE id = ?`, [commentId]);
  // 计数据减，兜底不小于 0（防止并发/历史脏数据把计数压成负数）
  await exec(`UPDATE contents SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?`, [id]);

  const who = isCommentAuthor
    ? '本人'
    : isContentAuthor
      ? '内容作者'
      : isAdmin
        ? '管理员'
        : '评论审核员';
  await audit(
    viewer.id,
    'COMMENT_DELETE',
    'comment',
    commentId,
    `${who}删除《${row.title || ''}》下的评论`,
    ''
  );

  return ok({ id: commentId, deleted: true });
});
