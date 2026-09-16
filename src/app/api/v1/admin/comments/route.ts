import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, clientIp, HttpError } from '@/server/http';
import { UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * 后台「评论管理」。
 *
 * 之前全站评论只有内容详情页内的增删接口，没有任何治理入口 —— 被举报或含违规
 * 内容的评论只能靠删整篇内容才能清掉。这里补上全站评论视图：按关键词/作者/内容
 * 搜索、删除单条或批量，删除后回写 contents.comment_count 保证计数不漂移。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: string | null, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** GET /api/v1/admin/comments?q=&page=&pageSize= */
export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'contents');
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);
  const offset = (page - 1) * pageSize;

  const conds: string[] = [];
  const args: unknown[] = [];
  const kw = str(sp.get('q')).trim();
  if (kw) {
    conds.push('(cm.body LIKE ? OR u.display_name LIKE ? OR u.username LIKE ? OR c.title LIKE ?)');
    const like = `%${kw}%`;
    args.push(like, like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT cm.id, cm.body, cm.content_id,
            DATE_FORMAT(cm.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color,
            c.id AS cid, c.title AS content_title, c.status AS content_status
     FROM comments cm
     JOIN users u   ON u.id = cm.user_id
     JOIN contents c ON c.id = cm.content_id
     ${where}
     ORDER BY cm.created_at DESC
     LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );
  const totalRow = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM comments cm
     JOIN users u ON u.id = cm.user_id
     JOIN contents c ON c.id = cm.content_id ${where}`,
    args
  );

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      author: { id: r.user_id, username: r.username, displayName: r.display_name, avatarColor: r.avatar_color },
      content: { id: r.cid, title: r.content_title, status: r.content_status },
    })),
    total: Number(totalRow?.c || 0),
    page,
    pageSize,
  });
});

/**
 * DELETE /api/v1/admin/comments?ids=a,b,c
 * 删除后回写所属内容的 comment_count（不小于 0），避免删评论后计数虚高。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'contents')) as UserRow;
  const sp = new URL(req.url).searchParams;
  const ids = str(sp.get('ids')).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要删除的评论');

  const ph = ids.map(() => '?').join(',');
  // 按内容分组统计：同一篇内容删多条时，comment_count 要一次性减干净，
  // 不能只按「涉及了几篇内容」减 1，否则计数会虚高。
  const grouped = await q<{ content_id: string; c: number }>(
    `SELECT content_id, COUNT(*) AS c FROM comments WHERE id IN (${ph}) GROUP BY content_id`,
    ids
  );
  const bodies = await q<{ body: string }>(`SELECT body FROM comments WHERE id IN (${ph})`, ids);

  await exec(`DELETE FROM comments WHERE id IN (${ph})`, ids);
  for (const g of grouped) {
    await exec(
      `UPDATE contents SET comment_count = GREATEST(0, comment_count - ?) WHERE id = ?`,
      [Number(g.c), g.content_id]
    );
  }

  // audit_logs.entity_id 是 VARCHAR(36)，多个 id 拼起来会超长（Data too long），
  // 所以主 id 只记第一条，完整列表放 detail。
  await audit(
    user.id, 'COMMENT_DELETE', 'comment', ids[0] || '',
    `删除评论 ${ids.length} 条：${bodies.map((b) => b.body.slice(0, 20)).slice(0, 3).join(' / ')}`,
    clientIp(req)
  );
  return ok({ deleted: ids.length, touchedContents: grouped.length });
});
