import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { mapGroup } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const viewer = (await currentUser(req)) as UserRow | null;
  const id = ctx.params.id;
  const vid = viewer?.id;
  const row = await one<any>(
    `SELECT g.id, g.name, g.description, g.category, g.city, g.cover,
            DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS owner_id, u.username AS owner_username,
            u.display_name AS owner_name, u.avatar_color AS owner_color,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
            ${vid ? `EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)` : '0'} AS joined
     FROM \`groups\` g JOIN users u ON u.id = g.owner_id WHERE g.id = ?`,
    vid ? [vid, id] : [id]
  );
  if (!row) throw notFound('团契不存在');

  const members = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.city, m.role
     FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? ORDER BY FIELD(m.role,'owner','member'), m.joined_at ASC`, [id]
  );
  const posts = await q<any>(
    `SELECT p.id, p.body, DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color
     FROM group_posts p JOIN users u ON u.id = p.user_id
     WHERE p.group_id = ? ORDER BY p.created_at DESC LIMIT 50`, [id]
  );

  return ok({
    ...mapGroup(row),
    members: members.map((m) => ({
      id: m.id, username: m.username, displayName: m.display_name,
      avatarColor: m.avatar_color, city: m.city, role: m.role,
    })),
    posts: posts.map((p) => ({
      id: p.id, body: p.body, createdAt: p.created_at,
      user: { id: p.user_id, username: p.username, displayName: p.display_name, avatarColor: p.avatar_color },
    })),
  });
});
