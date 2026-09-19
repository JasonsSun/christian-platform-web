import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, readJson, clientIp, HttpError } from '@/server/http';
import { UserRow } from '@/server/auth';
import { requireModeratorModule } from '@/server/moderation';
import { audit } from '@/server/services';
import { notifyTopicFollowers } from '@/server/topicFollows';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/**
 * 后台「内容管理」——审核队列(/admin/reviews)之外的全量内容视图。
 *
 * 与审核队列的区别：这里能按标题/作者/标签搜索、按状态与类型筛选、分页翻全部历史，
 * 并支持直接改状态（上架/下架/退回草稿）与删除。写操作全部记审计日志。
 */

const num = (v: string | null, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** GET /api/v1/admin/contents?q=&status=&type=&page=&pageSize= */
export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'contents');
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);
  const offset = (page - 1) * pageSize;

  const conds: string[] = [];
  const args: unknown[] = [];

  const status = str(sp.get('status')).trim();
  if (status && status !== 'all') { conds.push('c.status = ?'); args.push(status); }

  const type = str(sp.get('type')).trim();
  if (type && type !== 'all') { conds.push('c.content_type = ?'); args.push(type); }

  const kw = str(sp.get('q')).trim();
  if (kw) {
    conds.push('(c.title LIKE ? OR c.body LIKE ? OR c.tags LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?)');
    const like = `%${kw}%`;
    args.push(like, like, like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT c.id, c.title, c.content_type, c.status, c.scope, c.region, c.tags,
            c.like_count, c.comment_count, c.view_count,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
            u.id AS author_id, u.username, u.display_name, u.avatar_color,
            (SELECT COUNT(*) FROM reports rp WHERE rp.target_id = c.id AND rp.target_type='content' AND rp.status='open') AS open_reports
     FROM contents c
     JOIN users u ON u.id = c.author_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...args, pageSize, offset]
  );

  const totalRow = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM contents c JOIN users u ON u.id = c.author_id ${where}`,
    args
  );

  // 状态计数（不受筛选影响，用于页签上的角标）
  const statusCounts = await q<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM contents GROUP BY status`
  );

  return ok({
    items: rows.map(mapContent),
    total: Number(totalRow?.c || 0),
    page,
    pageSize,
    statusCounts: statusCounts.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = Number(r.c);
      return acc;
    }, {}),
  });
});

function mapContent(r: any) {
  return {
    id: r.id,
    title: r.title,
    contentType: r.content_type,
    status: r.status,
    scope: r.scope,
    region: r.region,
    tags: r.tags || '',
    likeCount: Number(r.like_count || 0),
    commentCount: Number(r.comment_count || 0),
    viewCount: Number(r.view_count || 0),
    createdAt: r.created_at,
    publishedAt: r.published_at,
    openReports: Number(r.open_reports || 0),
    author: {
      id: r.author_id,
      username: r.username,
      displayName: r.display_name,
      avatarColor: whiteSafeColor(r.avatar_color),
    },
  };
}

/**
 * PATCH /api/v1/admin/contents —— 批量改状态。
 * body: { ids: string[], status: 'published'|'rejected'|'draft'|'pending_review' }
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'contents')) as UserRow;
  const body = await readJson<{ ids?: unknown; status?: unknown }>(req);
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => str(x).trim()).filter(Boolean).slice(0, 100) : [];
  const status = str(body.status).trim();
  const allowed = ['published', 'rejected', 'draft', 'pending_review'];
  if (!ids.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要操作的内容');
  if (!allowed.includes(status)) throw new HttpError(422, 'VALIDATION_FAILED', '目标状态不合法');

  const ph = ids.map(() => '?').join(',');
  // 只给「本次才刚上架」的内容通知话题关注者：重复上架同一篇会再刷一遍通知，
  // 属于骚扰。这里先记下上架前的状态，事后只对转 published 的那些发。
  let newlyPublished: Array<{ id: string; title: string; tags: string; author_id: string }> = [];
  if (status === 'published') {
    newlyPublished = await q<{ id: string; title: string; tags: string; author_id: string }>(
      `SELECT id, title, tags, author_id FROM contents WHERE id IN (${ph}) AND status <> 'published'`,
      ids
    );
  }

  // 上架时补 published_at，下架/退回草稿时清空，避免「已发布但无发布时间」的脏数据
  if (status === 'published') {
    await exec(
      `UPDATE contents SET status = ?, published_at = COALESCE(published_at, NOW()) WHERE id IN (${ph})`,
      [status, ...ids]
    );
  } else {
    await exec(`UPDATE contents SET status = ?, published_at = NULL WHERE id IN (${ph})`, [status, ...ids]);
  }

  let notified = 0;
  for (const c of newlyPublished) {
    try {
      notified += await notifyTopicFollowers({
        id: c.id,
        title: c.title,
        tags: c.tags,
        authorId: c.author_id,
      });
    } catch {
      /* 通知失败不影响上架结果 */
    }
  }

  await audit(user.id, 'CONTENT_STATUS_CHANGE', 'content', ids[0] || '', `批量改为 ${status}（${ids.length} 条）`, clientIp(req));
  return ok({ updated: ids.length, status, notified });
});

/**
 * DELETE /api/v1/admin/contents?ids=a,b,c —— 删除内容。
 * comments / likes / favorites 由外键级联删除，这里只需保证审计留痕。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = (await requireModeratorModule(req, 'contents')) as UserRow;
  const sp = new URL(req.url).searchParams;
  const ids = str(sp.get('ids')).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要删除的内容');

  // 审计里留下标题，删完也能查到删了什么
  const titles = await q<{ id: string; title: string }>(
    `SELECT id, title FROM contents WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const ph = ids.map(() => '?').join(',');
  await exec(`DELETE FROM contents WHERE id IN (${ph})`, ids);

  await audit(
    user.id, 'CONTENT_DELETE', 'content', ids[0] || '',
    `删除内容：${titles.map((t) => t.title).slice(0, 5).join(' / ') || ids.join(',')}`,
    clientIp(req)
  );
  return ok({ deleted: ids.length });
});
