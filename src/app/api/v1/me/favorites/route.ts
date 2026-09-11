import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { mapContent } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/favorites -> 我收藏的内容(稍后读列表) */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const rows = await q<any>(
    `SELECT c.id, c.title, c.body, c.content_type, c.status, c.scope, c.tags, c.cover,
            c.like_count, c.comment_count, c.view_count,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
            u.id AS author_id, u.username AS author_username,
            u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked
     FROM content_favorites f JOIN contents c ON c.id = f.content_id
     JOIN users u ON u.id = c.author_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`, [user.id]
  );
  return ok({ items: rows.map(mapContent) });
});
