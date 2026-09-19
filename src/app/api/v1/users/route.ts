import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as UserRow | null;
  const keyword = (sp.get('q') || '').trim();
  const city = sp.get('city') || '';
  const role = sp.get('role') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);

  // SELECT 子句中 viewer 占位参数(关注 / 好友状态)
  const selectArgs: any[] = [];
  if (viewer) {
    selectArgs.push(viewer.id); // following 子查询
    // friendStatus 子查询需要 4 个 viewer.id
    selectArgs.push(viewer.id, viewer.id, viewer.id, viewer.id);
  }

  const where: string[] = ["status = 'active'"];
  const whereArgs: any[] = [];
  if (keyword) {
    where.push('(username LIKE ? OR display_name LIKE ? OR church LIKE ?)');
    whereArgs.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (city) { where.push('city = ?'); whereArgs.push(city); }
  if (role) { where.push('role = ?'); whereArgs.push(role); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.role, u.avatar_color, u.bio, u.city, u.church,
            DATE_FORMAT(u.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM contents c WHERE c.author_id = u.id AND c.status='published') AS contents,
            ${viewer ? `EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = ? AND f2.followee_id = u.id)` : '0'} AS following,
            ${viewer ? `(
              SELECT CASE
                -- 只要存在 accepted 记录,双方即为好友(避免反向 pending 记录把状态盖回「已发送」)
                WHEN MAX(fr.status = 'accepted') = 1 THEN 'friends'
                WHEN MAX(fr.status = 'pending' AND fr.requester_id = ?) = 1 THEN 'pending_sent'
                WHEN MAX(fr.status = 'pending' AND fr.addressee_id = ?) = 1 THEN 'pending_received'
                ELSE 'none'
              END
              FROM friend_requests fr
              WHERE (fr.requester_id = ? AND fr.addressee_id = u.id) OR (fr.addressee_id = ? AND fr.requester_id = u.id)
            )` : "'none'"} AS friendStatus
     FROM users u ${whereSql} ORDER BY followers DESC, u.created_at DESC LIMIT ? OFFSET ?`,
    [...selectArgs, ...whereArgs, pageSize, (page - 1) * pageSize]
  );

  const totalRow = await one<any>(`SELECT COUNT(*) AS c FROM users u ${whereSql}`, whereArgs);

  return ok({
    items: rows.map((r) => ({
      id: r.id, username: r.username, displayName: r.display_name, role: r.role,
      avatarColor: whiteSafeColor(r.avatar_color), bio: r.bio, city: r.city, church: r.church,
      createdAt: r.created_at, followers: Number(r.followers), contents: Number(r.contents),
      following: !!r.following, friendStatus: viewer ? (r.friendStatus || 'none') : 'none',
    })),
    total: Number(totalRow?.c || 0), page, pageSize,
  });
});
