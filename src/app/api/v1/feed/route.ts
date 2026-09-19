import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { mapContent } from '@/server/mappers';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/feed -> 关注用户发布的公开动态(内容 + 代祷),按时间合并 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;

  const contents = await q<any>(
    `SELECT c.id, c.title, c.body, c.content_type, c.status, c.scope, c.tags, c.cover,
            c.like_count, c.comment_count, c.view_count,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
            u.id AS author_id, u.username AS author_username,
            u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked
     FROM contents c JOIN users u ON u.id = c.author_id
     WHERE c.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
       AND c.author_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
       AND c.status = 'published'
     ORDER BY c.created_at DESC LIMIT 30`, [user.id, user.id]
  );

  const prayers = await q<any>(
    `SELECT p.id, p.body, p.amen_count, p.answered,
            DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color, 0 AS amened
     FROM prayers p JOIN users u ON u.id = p.user_id
     WHERE p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
       AND p.user_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
     ORDER BY p.created_at DESC LIMIT 20`, [user.id, user.id]
  );

  const items = [
    ...contents.map((c: any) => ({ type: 'content', data: mapContent(c) })),
    ...prayers.map((p: any) => ({
      type: 'prayer',
      data: {
        id: p.id, body: p.body, amenCount: Number(p.amen_count || 0), answered: !!p.answered,
        createdAt: p.created_at, amened: !!p.amened,
        user: { id: p.user_id, username: p.username, displayName: p.display_name, avatarColor: whiteSafeColor(p.avatar_color) },
      },
    })),
  ].sort((a: any, b: any) => String(b.data.createdAt || '').localeCompare(String(a.data.createdAt || '')));

  return ok({ items, following: contents.length + prayers.length });
});
