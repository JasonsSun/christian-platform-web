import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, readJson, HttpError, clientIp } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';
import { audit, dispatchOutbox, emit } from '@/server/services';
import { notifyTopicFollowers } from '@/server/topicFollows';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** id 为 review_task.id */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const reviewer = await requireModeratorModule(req, 'contents');
  const body = await readJson<{ action?: string; reason?: string }>(req);
  const action = body.action;
  if (action !== 'approve' && action !== 'reject') {
    throw new HttpError(422, 'VALIDATION_FAILED', "action 必须是 approve 或 reject");
  }

  const task = await one<any>(`SELECT * FROM review_tasks WHERE id = ?`, [ctx.params.id]);
  if (!task) throw notFound('审核任务不存在');
  if (task.status !== 'pending') throw new HttpError(409, 'ALREADY_DECIDED', '该任务已审核完成');

  const content = await one<any>(`SELECT * FROM contents WHERE id = ?`, [task.content_id]);
  if (!content) throw notFound('关联内容不存在');

  const nextStatus = action === 'approve' ? 'published' : 'rejected';
  await exec(`UPDATE contents SET status = ?, published_at = ? WHERE id = ?`,
    [nextStatus, action === 'approve' ? ts() : null, content.id]);
  await exec(`UPDATE review_tasks SET status = ?, reviewer_id = ?, reason = ?, decided_at = ? WHERE id = ?`,
    [action === 'approve' ? 'approved' : 'rejected', reviewer.id, body.reason || '', ts(), task.id]);

  await emit(action === 'approve' ? 'content.approved' : 'content.rejected',
    { contentId: content.id, reason: body.reason || '' });
  await dispatchOutbox();
  // 上架瞬间通知话题关注者。放在审核之后而不是投稿时：审核期就通知的话，
  // 用户点进去是 404/无权限，等于骚扰。通知失败不能回滚审核结果。
  let notified = 0;
  if (action === 'approve') {
    try {
      const author = await one<any>(`SELECT display_name, username FROM users WHERE id = ?`, [content.author_id]);
      notified = await notifyTopicFollowers({
        id: content.id,
        title: content.title,
        tags: content.tags,
        authorId: content.author_id,
        authorName: author?.display_name || author?.username || '',
      });
    } catch {
      /* 通知失败不影响审核结果 */
    }
  }

  await audit(reviewer.id, action === 'approve' ? 'CONTENT_APPROVE' : 'CONTENT_REJECT',
    'content', content.id, `《${content.title}》${action === 'approve' ? '通过' : '驳回'}:${body.reason || '-'}`,
    clientIp(req));

  return ok({ id: task.id, contentId: content.id, status: nextStatus, notified });
});
