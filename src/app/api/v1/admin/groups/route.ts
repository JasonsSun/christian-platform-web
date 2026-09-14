import { NextRequest } from 'next/server';
import { one, q } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireModeratorModule } from '@/server/moderation';

export const dynamic = 'force-dynamic';

/** 群组管理:列表(含成员/帖子统计) */
export const GET = withApi(async (req: NextRequest) => {
  await requireModeratorModule(req, 'groups');
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(g.name LIKE ? OR g.city LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT g.id, g.name, g.category, g.city, g.description,
            DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name AS owner_name, u.username AS owner_username,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM group_posts p WHERE p.group_id = g.id) AS post_count
     FROM \`groups\` g LEFT JOIN users u ON u.id = g.owner_id
     ${whereSql} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM \`groups\` g ${whereSql}`, args);
  return ok({
    items: rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, city: r.city, description: r.description,
      createdAt: r.created_at, owner: r.owner_name || r.owner_username || '',
      memberCount: Number(r.member_count), postCount: Number(r.post_count),
    })),
    total: Number(total?.c || 0), page, pageSize,
  });
});
