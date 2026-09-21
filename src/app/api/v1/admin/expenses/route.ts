import { NextRequest } from 'next/server';
import { exec, one, q, ts, newId } from '@/server/db';
import { ok, withApi, readJson, HttpError, num, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * 支出管理(仅管理员)
 *
 * 这里维护公示页展示的支出明细。与捐赠不同:
 *  - 支出金额本身就是要公开的,管理端只是录入/下架入口;
 *  - stats 额外给出「已确认捐赠收入 - 已公示支出」的结余口径,
 *    便于管理员在录入时对账。
 *  - 删除走跳转式确认页(前端 confirmActions 已注册),
 *    API 本身也做存在性校验。
 */

const CATEGORIES = ['server', 'bandwidth', 'storage', 'ops', 'domain', 'other'] as const;
const STATUSES = ['published', 'hidden'] as const;

export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') || '';
  const category = sp.get('category') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if ((STATUSES as readonly string[]).includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  if ((CATEGORIES as readonly string[]).includes(category)) {
    where.push('category = ?');
    args.push(category);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT id, category, title, note, amount_cents, period, status,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM expenses ${whereSql}
     ORDER BY period DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM expenses ${whereSql}`, args);

  // 全量统计:支出侧
  const exp = await one<any>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN status='published' THEN amount_cents ELSE 0 END),0) AS published_sum,
            SUM(status='published') AS published_count,
            SUM(status='hidden') AS hidden_count
     FROM expenses`
  );
  // 结余口径:已确认捐赠收入(仅管理员可见) - 已公示支出
  const inc = await one<any>(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM donations WHERE status='confirmed'`
  );

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      note: r.note || '',
      amountCents: Number(r.amount_cents || 0),
      amountText: formatMoney(Number(r.amount_cents || 0)),
      period: r.period,
      status: r.status,
      createdAt: r.created_at,
    })),
    total: Number(total?.c || 0),
    page,
    pageSize,
    stats: {
      count: Number(exp?.c || 0),
      publishedCount: Number(exp?.published_count || 0),
      hiddenCount: Number(exp?.hidden_count || 0),
      publishedCents: Number(exp?.published_sum || 0),
      publishedAmountText: formatMoney(Number(exp?.published_sum || 0)),
      incomeConfirmedCents: Number(inc?.s || 0),
      incomeConfirmedText: formatMoney(Number(inc?.s || 0)),
      balanceCents: Number(inc?.s || 0) - Number(exp?.published_sum || 0),
      balanceText: formatMoney(Number(inc?.s || 0) - Number(exp?.published_sum || 0)),
    },
  });
});

/** 新增支出记录 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{
    category?: string;
    title?: string;
    note?: string;
    amount?: number | string;
    period?: string;
    status?: string;
  }>(req);

  const category = (CATEGORIES as readonly string[]).includes(body.category as never) ? body.category! : 'other';
  const title = (body.title || '').trim();
  if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '请填写支出事项');
  if (title.length > 120) throw new HttpError(422, 'VALIDATION_FAILED', '支出事项过长');

  const yuanVal = Number(body.amount);
  if (!Number.isFinite(yuanVal) || yuanVal <= 0) throw new HttpError(422, 'VALIDATION_FAILED', '请填写有效的支出金额');
  if (yuanVal > 10000000) throw new HttpError(422, 'VALIDATION_FAILED', '单笔金额过大,请核对后录入');
  const cents = Math.round(yuanVal * 100);
  if (cents < 1) throw new HttpError(422, 'VALIDATION_FAILED', '支出金额不低于 0.01 元');

  const period = /^\d{4}-\d{2}$/.test(body.period || '') ? body.period! : ts().slice(0, 7);
  const status = body.status === 'hidden' ? 'hidden' : 'published';
  const note = (body.note || '').trim().slice(0, 500);

  const id = newId('exp');
  await exec(
    `INSERT INTO expenses (id, category, title, note, amount_cents, period, status, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, category, title, note, cents, period, status, admin.id, ts()]
  );
  await audit(admin.id, 'EXPENSE_CREATE', 'expense', id, `新增支出公示「${title}」¥${formatMoney(cents)} (${period})`, clientIp(req));
  return ok({ id }, 201);
});

/** 编辑(金额/分类/事项/归属月/公示状态) */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{
    id?: string;
    category?: string;
    title?: string;
    note?: string;
    amount?: number | string;
    period?: string;
    status?: string;
  }>(req);

  const id = body.id || '';
  if (!id) throw new HttpError(400, 'BAD_REQUEST', '缺少 id');
  const row = await one<any>(`SELECT id, title, status FROM expenses WHERE id = ?`, [id]);
  if (!row) throw notFound('支出记录不存在');

  const sets: string[] = [];
  const args: any[] = [];

  if (body.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(body.category)) throw new HttpError(422, 'VALIDATION_FAILED', '分类无效');
    sets.push('category = ?');
    args.push(body.category);
  }
  if (body.title !== undefined) {
    const title = (body.title || '').trim();
    if (!title) throw new HttpError(422, 'VALIDATION_FAILED', '支出事项不能为空');
    if (title.length > 120) throw new HttpError(422, 'VALIDATION_FAILED', '支出事项过长');
    sets.push('title = ?');
    args.push(title);
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    args.push((body.note || '').trim().slice(0, 500));
  }
  if (body.amount !== undefined) {
    const yuanVal = Number(body.amount);
    if (!Number.isFinite(yuanVal) || yuanVal <= 0) throw new HttpError(422, 'VALIDATION_FAILED', '请填写有效的支出金额');
    const cents = Math.round(yuanVal * 100);
    if (cents < 1) throw new HttpError(422, 'VALIDATION_FAILED', '支出金额过低');
    sets.push('amount_cents = ?');
    args.push(cents);
  }
  if (body.period !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(body.period)) throw new HttpError(422, 'VALIDATION_FAILED', '归属月份格式应为 YYYY-MM');
    sets.push('period = ?');
    args.push(body.period);
  }
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(body.status)) throw new HttpError(422, 'VALIDATION_FAILED', '状态无效');
    sets.push('status = ?');
    args.push(body.status);
  }
  if (!sets.length) throw new HttpError(400, 'BAD_REQUEST', '没有需要更新的字段');

  args.push(id);
  await exec(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, args);
  await audit(admin.id, 'EXPENSE_UPDATE', 'expense', id, `更新支出公示「${row.title}」`, clientIp(req));
  return ok({ id, updated: true });
});

/** 删除(误录/重复录入时使用,走跳转式确认页) */
export const DELETE = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') || '';
  if (!id) throw new HttpError(400, 'BAD_REQUEST', '缺少 id');

  const row = await one<any>(`SELECT id, title FROM expenses WHERE id = ?`, [id]);
  if (!row) throw notFound('支出记录不存在');

  await exec(`DELETE FROM expenses WHERE id = ?`, [id]);
  await audit(admin.id, 'EXPENSE_DELETE', 'expense', id, `删除支出公示「${row.title}」`, clientIp(req));
  return ok({ id, deleted: true });
});
