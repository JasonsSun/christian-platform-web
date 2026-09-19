import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { currentUser, UserRow, userStats } from '@/server/auth';
import { mapContent } from '@/server/mappers';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const key = ctx.params.id;
  const row = await one<any>(
    `SELECT u.id, u.username, u.display_name, u.role, u.status, u.avatar_color, u.bio, u.city, u.church,
            DATE_FORMAT(u.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            ${viewer ? `EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id)` : '0'} AS following,
            ${viewer ? `EXISTS(SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = u.id)` : '0'} AS blocked
     FROM users u WHERE u.id = ? OR u.username = ?`,
    viewer ? [viewer.id, viewer.id, key, key] : [key, key]
  );
  if (!row) throw notFound('用户不存在');
  // 支持 /users/<id> 与 /users/<username> 两种访问方式（@提及链接用 username 更友好）
  const id = row.id;

  const stats = await userStats(id);
  const contents = await q<any>(
    `SELECT c.id, c.title, c.body, c.content_type, c.status, c.cover, c.tags,
            c.like_count, c.comment_count, c.view_count,
            DATE_FORMAT(c.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(c.published_at,'%Y-%m-%dT%H:%i:%sZ') AS published_at,
            u.id AS author_id, u.username AS author_username,
            u.display_name AS author_name, u.avatar_color AS author_color, 0 AS liked
     FROM contents c JOIN users u ON u.id = c.author_id
     WHERE c.author_id = ? AND c.status = 'published' ORDER BY c.created_at DESC LIMIT 12`, [id]
  );

  return ok({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatarColor: whiteSafeColor(row.avatar_color),
    bio: row.bio,
    city: row.city,
    church: row.church,
    createdAt: row.created_at,
    following: !!row.following,
    blocked: !!row.blocked,
    isMe: viewer?.id === id,
    stats,
    contents: contents.map(mapContent),
  });
});
