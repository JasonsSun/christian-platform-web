import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, notFound, readJson, HttpError, clientIp } from '@/server/http';
import { requireRole } from '@/server/auth';
import { audit, dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** id 为 review_task.id */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const reviewer = await requireRole(req, ['moderator', 'admin']);
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
  await audit(reviewer.id, action === 'approve' ? 'CONTENT_APPROVE' : 'CONTENT_REJECT',
    'content', content.id, `《${content.title}》${action === 'approve' ? '通过' : '驳回'}:${body.reason || '-'}`,
    clientIp(req));

  return ok({ id: task.id, contentId: content.id, status: nextStatus });
});
