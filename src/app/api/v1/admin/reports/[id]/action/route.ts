import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, badRequest, notFound } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/v1/admin/reports/{id}/action  body:{action:'dismiss'|'uphold', reason?} */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = (await requireRole(req, ['moderator', 'admin'])) as UserRow;
  const reportId = ctx.params.id;
  const report = await one<any>(`SELECT * FROM reports WHERE id = ?`, [reportId]);
  if (!report) throw notFound('举报不存在');
  if (report.status !== 'open') return ok({ ok: true, status: report.status });

  const b = await (await import('@/server/http')).readJson<{ action?: string; reason?: string }>(req);
  const action = b.action === 'uphold' ? 'uphold' : 'dismiss';
  const reason = (b.reason || '').slice(0, 200);

  if (action === 'uphold' && report.target_type === 'content') {
    await exec(`UPDATE contents SET status = 'rejected' WHERE id = ?`, [report.target_id]);
    const content = await one<any>(`SELECT author_id, title FROM contents WHERE id = ?`, [report.target_id]);
    if (content) {
      await notify(content.author_id, 'content_removed', '内容因举报被下架',
        `《${content.title}》因举报成立已被下架`, '');
    }
  }

  await exec(
    `UPDATE reports SET status = ?, handled_by = ?, handled_at = NOW() WHERE id = ?`,
    [action === 'uphold' ? 'upheld' : 'dismissed', user.id, reportId]
  );
  await audit(user.id, 'REPORT_' + (action === 'uphold' ? 'UPHELD' : 'DISMISSED'),
    report.target_type, report.target_id, reason);
  return ok({ ok: true, status: action === 'uphold' ? 'upheld' : 'dismissed' });
});
