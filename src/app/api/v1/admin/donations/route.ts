import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, num, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 捐赠管理(仅管理员)
 *
 * 这里是系统中唯一能看到真实捐赠金额的地方。
 * 金额以「分」存储,输出时同时给出 amountCents 与 amountText(元)。
 */

/** 展示名(与公开名录保持一致) */
function donationLabel(row: any): string {
  if (Number(row.anonymous)) return '爱心弟兄姊妹';
  if (row.donor_type === 'church') {
    const n = String(row.church_name || row.display_name || '').trim();
    if (!n) return '匿名教会';
    return /教会$/.test(n) ? n : `${n}教会`;
  }
  return String(row.display_name || '').trim() || '匿名';
}

const yuan = (cents: number) => {
  const y = cents / 100;
  return Number.isInteger(y) ? String(y) : y.toFixed(2);
};

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || '';
  const keyword = (sp.get('q') || '').trim();
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (status && ['pending', 'confirmed', 'rejected'].includes(status)) {
    where.push('d.status = ?');
    args.push(status);
  }
  if (keyword) {
    where.push('(d.display_name LIKE ? OR d.church_name LIKE ? OR d.message LIKE ? OR u.username LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT d.id, d.display_name, d.donor_type, d.church_name, d.amount_cents, d.message, d.anonymous,
            d.status, d.note,
            DATE_FORMAT(d.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(d.reviewed_at,'%Y-%m-%dT%H:%i:%sZ') AS reviewed_at,
            u.id AS donor_id, u.username AS donor_username, u.display_name AS donor_display
     FROM donations d LEFT JOIN users u ON u.id = d.donor_id
     ${whereSql} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM donations d LEFT JOIN users u ON u.id = d.donor_id ${whereSql}`, args);

  // 全量统计(不受筛选影响,便于管理员掌握总盘)
  const agg = await one<any>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END), 0) AS confirmed_sum,
            SUM(status='confirmed') AS confirmed_count,
            SUM(status='pending')   AS pending_count,
            SUM(status='rejected')  AS rejected_count,
            COALESCE(SUM(CASE WHEN status='confirmed' AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01') THEN amount_cents ELSE 0 END), 0) AS month_sum
     FROM donations`
  );

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      displayName: donationLabel(r),
      donorType: r.donor_type === 'church' ? 'church' : 'personal',
      churchName: r.church_name || '',
      anonymous: !!Number(r.anonymous),
      amountCents: Number(r.amount_cents || 0),
      amountText: yuan(Number(r.amount_cents || 0)),
      message: r.message || '',
      status: r.status,
      note: r.note || '',
      donor: r.donor_id
        ? { id: r.donor_id, username: r.donor_username, displayName: r.donor_display }
        : null,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    })),
    total: Number(total?.c || 0),
    page,
    pageSize,
    stats: {
      totalCents: Number(agg?.confirmed_sum || 0),
      totalAmountText: yuan(Number(agg?.confirmed_sum || 0)),
      count: Number(agg?.c || 0),
      confirmedCount: Number(agg?.confirmed_count || 0),
      pendingCount: Number(agg?.pending_count || 0),
      rejectedCount: Number(agg?.rejected_count || 0),
      monthCents: Number(agg?.month_sum || 0),
      monthAmountText: yuan(Number(agg?.month_sum || 0)),
    },
  });
});

/** 审核捐赠记录:确认展示 / 驳回(附原因) / 撤回为待确认 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ id?: string; action?: string; note?: string }>(req);
  const id = body.id || '';
  if (!id) throw new HttpError(400, 'BAD_REQUEST', '缺少 id');

  const row = await one<any>(`SELECT id, status, display_name, donor_type, church_name FROM donations WHERE id = ?`, [id]);
  if (!row) throw notFound('捐赠记录不存在');

  const action = body.action || '';
  const map: Record<string, string> = { confirm: 'confirmed', reject: 'rejected', pending: 'pending' };
  const next = map[action];
  if (!next) throw new HttpError(422, 'VALIDATION_FAILED', 'action 无效');
  if (action === 'confirm' && row.status === 'confirmed') throw new HttpError(409, 'CONFLICT', '该记录已是已确认状态');

  const note = (body.note || '').trim().slice(0, 200);

  await exec(
    `UPDATE donations SET status = ?, note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
    [next, note, admin.id, ts(), id]
  );
  await audit(admin.id, 'DONATION_REVIEW', 'donation', id, `捐赠记录 -> ${next}${note ? ` (${note})` : ''}`, clientIp(req));

  return ok({ id, status: next, note });
});
