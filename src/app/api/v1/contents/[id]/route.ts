import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, HttpError, notFound, forbidden, readJson } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapContent } from '@/server/mappers';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const SELECT_ONE = (viewerId?: string) => `
  SELECT c.id, c.title, c.body, c.content_type, c.status, c.scope, c.tags, c.cover,
         c.like_count, c.comment_count, c.view_count, c.author_id,
         DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
         DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
         u.id AS author_id, u.username AS author_username,
         u.display_name AS author_name, u.avatar_color AS author_color,
         ${viewerId
           ? 'EXISTS(SELECT 1 FROM content_likes l WHERE l.content_id = c.id AND l.user_id = ?)'
           : '0'} AS liked
  FROM contents c JOIN users u ON u.id = c.author_id
  WHERE c.id = ?`;

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const id = ctx.params.id;
  const row = viewer
    ? await one<any>(SELECT_ONE(viewer.id), [viewer.id, id])
    : await one<any>(SELECT_ONE(), [id]);
  if (!row) throw notFound('内容不存在');

  const canSeeAll = viewer && (viewer.role === 'admin' || viewer.role === 'moderator');
  if (row.status !== 'published' && !(viewer && (viewer.id === row.author_id || canSeeAll))) {
    throw notFound('内容不存在或未公开');
  }

  // 阅读数 +1(仅公开内容)
  if (row.status === 'published') {
    await exec(`UPDATE contents SET view_count = view_count + 1 WHERE id = ?`, [id]);
  }

  // 附带媒体(图片/视频/音乐/资料)
  const media = await q<any>(
    `SELECT m.id, m.kind, m.title, m.file_name, m.mime_type, m.size_bytes, m.storage_key,
            cm.media_role, cm.sort_order
     FROM content_media cm JOIN media_files m ON m.id = cm.media_file_id
     WHERE cm.content_id = ? AND m.status <> 'trashed' ORDER BY cm.sort_order`,
    [id]
  );
  const mapped = mapContent(row) as any;
  mapped.media = media.map((m) => ({
    id: m.id, kind: m.kind, title: m.title || m.file_name, fileName: m.file_name,
    mimeType: m.mime_type, sizeBytes: Number(m.size_bytes),
    url: m.storage_key ? '/' + String(m.storage_key).replace(/\\/g, '/') : '',
    role: m.media_role,
  }));
  return ok(mapped);
});

export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireUser(req);
  const id = ctx.params.id;
  const row = await one<any>(`SELECT * FROM contents WHERE id = ?`, [id]);
  if (!row) throw notFound('内容不存在');
  const isOwner = row.author_id === viewer.id;
  const isStaff = viewer.role === 'admin' || viewer.role === 'moderator';
  if (!isOwner && !isStaff) throw forbidden('只能修改自己的内容');

  const body = await readJson<{ title?: string; body?: string; contentType?: string; tags?: string[]; cover?: string }>(req);
  const fields: string[] = [];
  const args: any[] = [];
  if (body.title) { fields.push('title = ?'); args.push(body.title); }
  if (body.body) { fields.push('body = ?'); args.push(body.body); fields.push("status = 'pending_review'"); }
  if (body.contentType) { fields.push('content_type = ?'); args.push(body.contentType); }
  if (body.tags) { fields.push('tags = ?'); args.push(body.tags.join(',')); }
  if (body.cover) { fields.push('cover = ?'); args.push(body.cover); }
  if (!fields.length) throw new HttpError(400, 'BAD_REQUEST', '没有可更新的字段');

  args.push(id);
  await exec(`UPDATE contents SET ${fields.join(',')} WHERE id = ?`, args);
  await audit(viewer.id, 'CONTENT_UPDATE', 'content', id, '更新内容', '');
  return ok({ id, updated: true });
});

export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireUser(req);
  const id = ctx.params.id;
  const row = await one<any>(`SELECT * FROM contents WHERE id = ?`, [id]);
  if (!row) throw notFound('内容不存在');
  const isStaff = viewer.role === 'admin' || viewer.role === 'moderator';
  if (row.author_id !== viewer.id && !isStaff) throw forbidden('只能删除自己的内容');

  await exec(`DELETE FROM contents WHERE id = ?`, [id]);
  await audit(viewer.id, 'CONTENT_DELETE', 'content', id, `删除《${row.title}》`, '');
  return ok({ id, deleted: true });
});
