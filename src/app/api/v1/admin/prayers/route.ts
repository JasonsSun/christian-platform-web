import { NextRequest } from 'next/server';
import { q, one } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireRole } from '@/server/auth';
import { mapPrayer } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/**
 * 管理端代祷墙列表。
 * 管理员 / 审核员可搜索、翻页查看全部代祷（含被举报过的高风险内容置顶），
 * 便于主动巡查违规违法内容并逐条移除（DELETE /api/v1/prayers/[id]）。
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const kw = (sp.get('q') || '').trim();
  const scope = sp.get('scope') || 'all'; // all | answered | unanswered | long
  const page = Math.max(1, num(sp.get('page'), 1));
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (kw) {
    where.push('(p.body LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?)');
    const like = `%${kw}%`;
    args.push(like, like, like);
  }
  if (scope === 'answered') where.push('p.answered = 1');
  if (scope === 'unanswered') where.push('p.answered = 0');
  // 长文更可能是广告/灌水，单列一档便于优先巡查
  if (scope === 'long') where.push('CHAR_LENGTH(p.body) >= 300');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT p.id, p.body, p.amen_count, p.answered,
            DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color,
            0 AS amened
     FROM prayers p JOIN users u ON u.id = p.user_id
     ${whereSql}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(
    `SELECT COUNT(*) AS c FROM prayers p JOIN users u ON u.id = p.user_id ${whereSql}`,
    args
  );

  const stats = await one<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN answered = 1 THEN 1 ELSE 0 END) AS answered,
            SUM(CASE WHEN CHAR_LENGTH(body) >= 300 THEN 1 ELSE 0 END) AS longBody
     FROM prayers`
  );

  return ok({
    items: rows.map(mapPrayer),
    total: Number(total?.c || 0),
    page,
    pageSize,
    stats: {
      total: Number(stats?.total || 0),
      answered: Number(stats?.answered || 0),
      longBody: Number(stats?.longBody || 0),
    },
  });
});
