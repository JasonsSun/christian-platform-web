import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * 支出公示 —— 公开接口
 *
 * 透明度规则(注意与捐赠方向相反):
 *  - 支出明细与金额对所有人全额公开,这正是公示的意义;
 *  - 只返回 status = 'published' 的记录;
 *  - 捐赠收入总额不在此返回(收入真实金额仅管理员可见),
 *    公示页的「结余」由管理端口径计算,这里只给支出侧数据。
 */

const CATEGORY_LABEL: Record<string, string> = {
  server: '服务器',
  bandwidth: '带宽/CDN',
  storage: '存储',
  ops: '运维',
  domain: '域名/证书',
  other: '其他',
};

const yuan = (cents: number) => {
  const y = cents / 100;
  return Number.isInteger(y) ? String(y) : y.toFixed(2);
};

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const category = sp.get('category') || '';
  const period = sp.get('period') || '';

  const where: string[] = ["e.status = 'published'"];
  const args: any[] = [];
  if (category && CATEGORY_LABEL[category]) {
    where.push('e.category = ?');
    args.push(category);
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    where.push('e.period = ?');
    args.push(period);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await q<any>(
    `SELECT e.id, e.category, e.title, e.note, e.amount_cents, e.period,
            DATE_FORMAT(e.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM expenses e ${whereSql}
     ORDER BY e.period DESC, e.created_at DESC, e.id DESC`
  );

  // 分类汇总
  const byCategory = await q<any>(
    `SELECT category, COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS s
     FROM expenses ${whereSql.replace(/\be\./g, '')}
     GROUP BY category ORDER BY s DESC`
  );

  // 月度汇总(近12个月)
  const byPeriod = await q<any>(
    `SELECT period, COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS s
     FROM expenses ${whereSql.replace(/\be\./g, '')}
     GROUP BY period ORDER BY period DESC LIMIT 12`
  );

  const totalCents = byCategory.reduce((acc: number, r: any) => acc + Number(r.s || 0), 0);

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: CATEGORY_LABEL[r.category] || '其他',
      title: r.title,
      note: r.note || '',
      amountCents: Number(r.amount_cents || 0),
      amountText: yuan(Number(r.amount_cents || 0)),
      period: r.period,
      createdAt: r.created_at,
    })),
    byCategory: byCategory.map((r: any) => ({
      category: r.category,
      label: CATEGORY_LABEL[r.category] || '其他',
      count: Number(r.c || 0),
      amountCents: Number(r.s || 0),
      amountText: yuan(Number(r.s || 0)),
    })),
    byPeriod: byPeriod.map((r: any) => ({
      period: r.period,
      count: Number(r.c || 0),
      amountCents: Number(r.s || 0),
      amountText: yuan(Number(r.s || 0)),
    })),
    totalCents,
    totalAmountText: yuan(totalCents),
    categories: Object.entries(CATEGORY_LABEL).map(([id, label]) => ({ id, label })),
  });
});
