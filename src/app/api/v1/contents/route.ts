import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, readJson, withApi, HttpError, clientIp, num } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapContent } from '@/server/mappers';
import { audit, dispatchOutbox, emit } from '@/server/services';
import { guardWrite } from '@/server/guard';

export const dynamic = 'force-dynamic';

const BASE = `
  SELECT c.id, c.title, c.body, c.content_type, c.status, c.scope, c.tags, c.cover,
         c.like_count, c.comment_count, c.view_count,
         DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
         DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
         u.id AS author_id, u.username AS author_username,
         u.display_name AS author_name, u.avatar_color AS author_color,
         %LIKED% AS liked
  FROM contents c JOIN users u ON u.id = c.author_id`;

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as UserRow | null;
  const status = sp.get('status') || 'published';
  const type = sp.get('type') || '';
  const keyword = (sp.get('q') || '').trim();
  const authorId = sp.get('authorId') || '';
  const sort = sp.get('sort') || 'new';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 10), 50);

  const where: string[] = [];
  const args: any[] = [];

  if (viewer) args.push(viewer.id); // liked 子查询参数

  if (status !== 'all') {
    if (status === 'mine') {
      if (!viewer) throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
      where.push('c.author_id = ?');
      args.push(viewer.id);
    } else {
      where.push('c.status = ?');
      args.push(status);
    }
  } else if (viewer) {
    // 全部:仅管理员/审核员可见非公开内容
    const canSeeAll = viewer.role === 'admin' || viewer.role === 'moderator';
    if (!canSeeAll) {
      where.push('(c.status = ? OR c.author_id = ?)');
      args.push('published', viewer.id);
    }
  } else {
    where.push("c.status = 'published'");
  }

  if (type) { where.push('c.content_type = ?'); args.push(type); }
  if (authorId) { where.push('c.author_id = ?'); args.push(authorId); }
  if (keyword) {
    where.push('(c.title LIKE ? OR c.body LIKE ? OR c.tags LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const sql = BASE.replace('%LIKED%', viewer
    ? 'EXISTS(SELECT 1 FROM content_likes l WHERE l.content_id = c.id AND l.user_id = ?)'
    : '0');

  const orderBy =
    sort === 'hot' ? 'c.like_count DESC, c.view_count DESC' :
    sort === 'old' ? 'c.created_at ASC' : 'c.created_at DESC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await q<any>(
    `${sql} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const totalRow = await one<any>(
    `SELECT COUNT(*) AS c FROM contents c ${whereSql}`,
    args.filter((_, i) => !(viewer && i === 0))
  );

  return ok({ items: rows.map(mapContent), total: Number(totalRow?.c || 0), page, pageSize });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  await guardWrite(req, 'content', user.id);
  const body = await readJson<{
    title?: string; body?: string; contentType?: string; tags?: string[]; cover?: string; status?: string;
    mediaIds?: string[];
  }>(req);

  const title = (body.title || '').trim();
  const content = (body.body || '').trim();
  if (title.length < 2) throw new HttpError(422, 'VALIDATION_FAILED', '标题至少 2 个字');
  if (content.length < 5) throw new HttpError(422, 'VALIDATION_FAILED', '正文至少 5 个字');

  const contentType = body.contentType || 'article';
  const status = body.status === 'draft' ? 'draft' : 'pending_review';
  const id = newId('cnt');

  await exec(
    `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover,
                           like_count, comment_count, view_count, created_at, published_at)
     VALUES (?,?,?,?,?,?,'global','CN',?,?,0,0,0,?,NULL)`,
    [id, user.id, title, content, contentType, status, (body.tags || []).join(','), body.cover || '📝', ts()]
  );

  if (status === 'pending_review') {
    await exec(
      `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
      [newId('rvw'), id, 'pending', null, '', ts()]
    );
    await emit('content.submitted', { contentId: id, title, actorId: user.id });
    await dispatchOutbox();
  }

  // 关联本人上传的媒体(图片/视频/音乐/资料)
  const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.slice(0, 12) : [];
  let attached = 0;
  for (let i = 0; i < mediaIds.length; i++) {
    const mid = mediaIds[i];
    if (!mid) continue;
    const m = await one<any>(
      `SELECT id FROM media_files WHERE id = ? AND owner_id = ? AND status <> 'trashed'`, [mid, user.id]
    );
    if (!m) continue;
    await exec(
      `INSERT IGNORE INTO content_media (content_id, media_file_id, media_role, sort_order) VALUES (?,?,?,?)`,
      [id, mid, 'attachment', i]
    );
    await exec(
      `UPDATE media_files SET ref_count = (SELECT COUNT(*) FROM content_media WHERE media_file_id = ?) WHERE id = ?`,
      [mid, mid]
    );
    attached++;
  }

  await audit(user.id, 'CONTENT_CREATE', 'content', id, `创建内容《${title}》(${status})`, clientIp(req));

  const row = await one<any>(`
    SELECT c.*, DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
           DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
           u.id AS author_id, u.username AS author_username,
           u.display_name AS author_name, u.avatar_color AS author_color
    FROM contents c JOIN users u ON u.id = c.author_id WHERE c.id = ?`, [id]);

  return ok(mapContent({ ...row, liked: 0 }), 201);
});
