import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser } from '@/server/auth';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/blocks —— 我屏蔽的用户列表 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.city, u.church,
            DATE_FORMAT(b.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM user_blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    [user.id]
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarColor: whiteSafeColor(r.avatar_color),
      city: r.city || '',
      church: r.church || '',
      createdAt: r.created_at,
    })),
  });
});
