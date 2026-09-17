import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { mapContent } from '@/server/mappers';
import { listFolders, moveFavorites } from '@/server/favoriteFolders';

export const dynamic = 'force-dynamic';

/**
 * GET   /api/v1/me/favorites?folder=all|unfiled|<folderId>  我的收藏（可按分类筛）
 * PATCH /api/v1/me/favorites  { contentIds: string[], folderId: string|null }  批量移动到分类
 */

export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const folder = (sp.get('folder') || 'all').trim();

  const where: string[] = ['f.user_id = ?'];
  const args: any[] = [user.id];
  if (folder === 'unfiled') {
    where.push("(f.folder_id IS NULL OR f.folder_id = '')");
  } else if (folder && folder !== 'all') {
    where.push('f.folder_id = ?');
    args.push(folder);
  }

  const rows = await q<any>(
    `SELECT c.id, c.title, c.body, c.content_type, c.status, c.scope, c.tags, c.cover,
            c.like_count, c.comment_count, c.view_count,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
            u.id AS author_id, u.username AS author_username,
            u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked,
            f.folder_id AS folder_id
     FROM content_favorites f JOIN contents c ON c.id = f.content_id
     JOIN users u ON u.id = c.author_id
     WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC`,
    args
  );

  const meta = await listFolders(user.id);

  return ok({
    items: rows.map((r) => ({ ...mapContent(r), folderId: r.folder_id ? String(r.folder_id) : null })),
    folders: meta.folders,
    unfiled: meta.unfiled,
    total: meta.total,
    folder,
  });
});

export const PATCH = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const body = await req.json().catch(() => ({} as any));
  const contentIds: string[] = Array.isArray(body?.contentIds)
    ? body.contentIds.map((x: unknown) => String(x))
    : [];
  const folderId = body?.folderId == null || body?.folderId === '' ? null : String(body.folderId);
  if (!contentIds.length) throw new HttpError(422, 'VALIDATION_FAILED', '请先选择要移动的内容');

  const changed = await moveFavorites(user.id, contentIds, folderId);
  const meta = await listFolders(user.id);
  return ok({ changed, folders: meta.folders, unfiled: meta.unfiled, total: meta.total });
});
