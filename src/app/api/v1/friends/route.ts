import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { num } from '@/server/http';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/friends  —— 我的好友(互为 accepted 的好友申请)
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 30), 50);

  const rows = await q<any>(
    `SELECT u.id, u.display_name, u.username, u.avatar_color, u.role, u.bio, u.city, u.church, u.status,
            DATE_FORMAT(fr.updated_at,'%Y-%m-%dT%H:%i:%sZ') AS friendSince,
            (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM contents c WHERE c.author_id = u.id AND c.status='published') AS contents
     FROM friend_requests fr
     JOIN users u ON u.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END
     WHERE (fr.requester_id = ? OR fr.addressee_id = ?) AND fr.status='accepted' AND u.status='active'
     ORDER BY fr.updated_at DESC
     LIMIT ? OFFSET ?`,
    [user.id, user.id, user.id, pageSize, (page - 1) * pageSize]
  );

  const totalRow = await q<any>(
    `SELECT COUNT(*) AS c FROM friend_requests fr JOIN users u ON u.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END
     WHERE (fr.requester_id = ? OR fr.addressee_id = ?) AND fr.status='accepted' AND u.status='active'`,
    [user.id, user.id, user.id]
  );

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      avatarColor: r.avatar_color,
      bio: r.bio,
      city: r.city,
      church: r.church,
      status: r.status,
      friendSince: r.friendSince,
      followers: Number(r.followers),
      contents: Number(r.contents),
    })),
    total: Number(totalRow[0]?.c || 0),
    page,
    pageSize,
  });
});
