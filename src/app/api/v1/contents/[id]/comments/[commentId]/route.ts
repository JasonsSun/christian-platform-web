import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, notFound, forbidden } from '@/server/http';
import { requireUser } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string; commentId: string } };

/**
 * 删除评论
 * 允许的三类人：评论作者本人 / 该内容作者 / 审核员·管理员
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

  const isStaff = viewer.role === 'admin' || viewer.role === 'moderator';
  const isCommentAuthor = row.user_id === viewer.id;
  const isContentAuthor = row.author_id === viewer.id;
  if (!isCommentAuthor && !isContentAuthor && !isStaff) {
    throw forbidden('只能删除自己的评论');
  }

  await exec(`DELETE FROM comments WHERE id = ?`, [commentId]);
  // 计数据减，兜底不小于 0（防止并发/历史脏数据把计数压成负数）
  await exec(`UPDATE contents SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?`, [id]);

  const who = isCommentAuthor ? '本人' : isContentAuthor ? '内容作者' : '管理员';
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
