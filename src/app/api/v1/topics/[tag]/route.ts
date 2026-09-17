import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { isFollowing, followerCount } from '@/server/topicFollows';

export const dynamic = 'force-dynamic';

/**
 * 单个话题概览。
 *
 * 返回：内容数 / 互动总量 / 首次与最近活跃 / 内容类型分布 / 主要作者 /
 *      共现标签（相关话题）/ 最近几条内容。
 * 话题不存在（没有任何已发布内容使用）时返回 empty=true 而不是 404，
 * 便于前端渲染空状态。
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const splitTags = (raw: string) =>
  Array.from(new Set(raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)));

const STAT_LIMIT = 500; // 统计采样上限，够用且不拖慢接口

export const GET = withApi(async (req: NextRequest, ctx: { params: { tag: string } }) => {
  const raw = str(ctx?.params?.tag).trim();
  if (!raw) throw new HttpError(422, 'VALIDATION_FAILED', '话题名不能为空');

  let tag = raw;
  try {
    tag = decodeURIComponent(raw);
  } catch {
    /* 保持原样 */
  }
  tag = tag.trim();
  if (!tag) throw new HttpError(422, 'VALIDATION_FAILED', '话题名不能为空');

  const like = `%,${tag},%`;
  const where = `c.status = 'published' AND CONCAT(',', REPLACE(c.tags, '，', ','), ',') LIKE ?`;

  const totalRow = await q<{ c: number }>(
    `SELECT COUNT(*) AS c FROM contents c WHERE ${where}`,
    [like]
  );
  const count = Number(totalRow[0]?.c || 0);

  const rows = await q<{
    id: string;
    title: string;
    content_type: string;
    tags: string;
    like_count: number;
    view_count: number;
    comment_count: number;
    author_id: string;
    display_name: string;
    username: string;
    avatar_color: string;
    at: string;
  }>(
    `SELECT c.id, c.title, c.content_type, c.tags,
            c.like_count, c.view_count, c.comment_count,
            c.author_id, u.display_name, u.username, u.avatar_color,
            DATE_FORMAT(COALESCE(c.published_at, c.created_at), '%Y-%m-%dT%H:%i:%sZ') AS at
     FROM contents c JOIN users u ON u.id = c.author_id
     WHERE ${where}
     ORDER BY at DESC
     LIMIT ${STAT_LIMIT}`,
    [like]
  );

  let likes = 0;
  let views = 0;
  let comments = 0;
  let lastAt = '';
  let firstAt = '';
  const typeMap = new Map<string, number>();
  const authorMap = new Map<string, { id: string; name: string; color: string; count: number }>();
  const relatedMap = new Map<string, number>();

  for (const r of rows) {
    likes += Number(r.like_count) || 0;
    views += Number(r.view_count) || 0;
    comments += Number(r.comment_count) || 0;
    const at = String(r.at || '');
    if (at && at > lastAt) lastAt = at;
    if (at && (!firstAt || at < firstAt)) firstAt = at;

    const ct = String(r.content_type || 'article');
    typeMap.set(ct, (typeMap.get(ct) || 0) + 1);

    const aid = String(r.author_id || '');
    if (aid) {
      const cur = authorMap.get(aid) || {
        id: aid,
        name: String(r.display_name || r.username || '匿名'),
        color: String(r.avatar_color || '#4f6df5'),
        count: 0,
      };
      cur.count += 1;
      authorMap.set(aid, cur);
    }

    for (const t of splitTags(String(r.tags || ''))) {
      if (t === tag) continue;
      relatedMap.set(t, (relatedMap.get(t) || 0) + 1);
    }
  }

  const types = Array.from(typeMap.entries())
    .map(([type, n]) => ({ type, count: n }))
    .sort((a, b) => b.count - a.count);

  const authors = Array.from(authorMap.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
    .slice(0, 6);

  const related = Array.from(relatedMap.entries())
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
    .slice(0, 12);

  const recent = rows.slice(0, 5).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    contentType: String(r.content_type || 'article'),
    at: String(r.at || ''),
    authorName: String(r.display_name || r.username || '匿名'),
  }));

  const viewer = (await currentUser(req).catch(() => null)) as UserRow | null;

  return ok({
    tag,
    count,
    likes,
    views,
    comments,
    firstAt,
    lastAt,
    types,
    authors,
    related,
    recent,
    sampled: rows.length,
    empty: count === 0,
    loggedIn: !!viewer,
    following: viewer ? await isFollowing(viewer.id, tag) : false,
    followers: await followerCount(tag),
  });
});
