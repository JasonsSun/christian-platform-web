import { NextRequest } from 'next/server';
import { exec, one, newId, ts } from '@/server/db';
import { ok, withApi, forbidden, notFound } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';
type Ctx = { params: { id: string } };

/** POST /api/v1/contents/{id}/submit  -> 提交草稿进入审核 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  const id = ctx.params.id;
  const c = await one<any>(`SELECT id, author_id, status, title FROM contents WHERE id = ?`, [id]);
  if (!c) throw notFound('内容不存在');
  if (c.author_id !== user.id && user.role === 'member') throw forbidden('仅作者本人可提交');
  if (c.status === 'published' || c.status === 'pending_review') {
    return ok({ ok: true, status: c.status });
  }
  await exec(`UPDATE contents SET status = 'pending_review', updated_at = NOW() WHERE id = ?`, [id]);
  const existing = await one<any>(`SELECT id FROM review_tasks WHERE content_id = ? AND status = 'pending'`, [id]);
  if (!existing) {
    await exec(
      `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
      [newId('rvw'), id, 'pending', null, '', ts()]
    );
  }
  await emit('content.submitted', { contentId: id, title: c.title, actorId: user.id });
  await dispatchOutbox();
  await audit(user.id, 'CONTENT_SUBMIT', 'content', id, `提交审核《${c.title}》`);
  return ok({ ok: true, status: 'pending_review' });
});
