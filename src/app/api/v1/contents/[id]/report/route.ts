import { NextRequest } from 'next/server';
import { exec, one, newId, ts } from '@/server/db';
import { ok, withApi, badRequest, notFound } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notifyRole } from '@/server/services';
import { guardWrite } from '@/server/guard';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const REASONS = [' spam', 'harmful', 'heresy', 'copyright', 'offensive', 'other'];
const REASON_LABEL: Record<string, string> = {
  spam: '垃圾广告', harmful: '有害信息', heresy: '异端偏差',
  copyright: '侵权', offensive: '冒犯性内容', other: '其他',
};

/** POST /api/v1/contents/{id}/report  body:{reason, detail?} */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireUser(req)) as UserRow;
  await guardWrite(req, 'report', user.id);
  const contentId = ctx.params.id;
  const content = await one<any>(`SELECT id, title, author_id FROM contents WHERE id = ?`, [contentId]);
  if (!content) throw notFound('内容不存在');
  const b = await (await import('@/server/http')).readJson<{ reason?: string; detail?: string }>(req);
  const reason = b.reason && REASONS.includes(b.reason) ? b.reason : 'other';
  await exec(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, detail, status, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [newId('rpt'), user.id, 'content', contentId, reason, (b.detail || '').slice(0, 500), 'open', ts()]
  );
  await audit(user.id, 'CONTENT_REPORT', 'content', contentId, `举报原因:${REASON_LABEL[reason] || reason}`, '');
  await notifyRole(['moderator', 'admin'], 'content_reported', '收到内容举报',
    `《${content.title}》被举报：${REASON_LABEL[reason] || reason}`, '/admin/reports');
  return ok({ ok: true });
});
