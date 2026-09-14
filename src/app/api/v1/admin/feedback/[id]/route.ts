import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { notFound, ok, readJson, withApi } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const STATUSES = ['new', 'processing', 'done', 'rejected'];

/** PATCH /api/v1/admin/feedback/{id}  body:{status?, adminReply?} */
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireRole(req, ['moderator', 'admin'])) as UserRow;
  const id = ctx.params.id;

  const row = await one<any>(
    `SELECT id, user_id, status, admin_reply FROM platform_feedback WHERE id = ?`,
    [id]
  );
  if (!row) throw notFound('建议不存在');

  const b = await readJson<{ status?: string; adminReply?: string }>(req);
  const status = b.status && STATUSES.includes(b.status) ? b.status : row.status;
  const reply = typeof b.adminReply === 'string' ? b.adminReply.slice(0, 1000) : row.admin_reply;

  await exec(
    `UPDATE platform_feedback SET status = ?, admin_reply = ?, handled_by = ?, handled_at = ? WHERE id = ?`,
    [status, reply, user.id, ts(), id]
  );
  await audit(user.id, 'FEEDBACK_HANDLE', 'feedback', id, `状态:${status}`, '');

  // 提交人有账号且回复内容有变化时，回一条站内通知
  const replyChanged = reply && reply !== (row.admin_reply || '');
  if (row.user_id && replyChanged) {
    await notify(row.user_id, 'feedback_reply', '平台回复了你的建议', reply.slice(0, 60), '/feedback');
  }

  return ok({ ok: true, status });
});
