import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, num, clientIp } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapGroup } from '@/server/mappers';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

const BASE = (viewerId?: string) => `
  SELECT g.id, g.name, g.description, g.category, g.city, g.cover,
         DATE_FORMAT(g.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
         u.id AS owner_id, u.username AS owner_username,
         u.display_name AS owner_name, u.avatar_color AS owner_color,
         (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
         ${viewerId ? `EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)` : '0'} AS joined
  FROM \`groups\` g JOIN users u ON u.id = g.owner_id`;

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as UserRow | null;
  const keyword = (sp.get('q') || '').trim();
  const category = sp.get('category') || '';
  const city = sp.get('city') || '';
  const scope = sp.get('scope') || 'all';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 12), 50);

  const args: any[] = [];
  if (viewer) args.push(viewer.id);
  const where: string[] = [];
  if (keyword) { where.push('(g.name LIKE ? OR g.description LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  if (category) { where.push('g.category = ?'); args.push(category); }
  if (city) { where.push('g.city = ?'); args.push(city); }
  if (scope === 'mine' && viewer) {
    where.push('EXISTS(SELECT 1 FROM group_members m2 WHERE m2.group_id = g.id AND m2.user_id = ?)');
    args.push(viewer.id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `${BASE(viewer?.id)} ${whereSql} ORDER BY member_count DESC, g.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM \`groups\` g ${whereSql}`,
    args.filter((_, i) => !(viewer && i === 0)));

  return ok({ items: rows.map(mapGroup), total: Number(total?.c || 0), page, pageSize });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<{ name?: string; description?: string; category?: string; city?: string; cover?: string }>(req);
  const name = (body.name || '').trim();
  const description = (body.description || '').trim();
  if (name.length < 2) throw new HttpError(422, 'VALIDATION_FAILED', '团契名称至少 2 个字');
  if (description.length < 5) throw new HttpError(422, 'VALIDATION_FAILED', '团契介绍至少 5 个字');

  const id = newId('grp');
  await exec(
    `INSERT INTO \`groups\` (id, name, description, category, owner_id, city, cover, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, description, body.category || 'fellowship', user.id, body.city || '', body.cover || '👥', ts()]
  );
  await exec(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`,
    [id, user.id, 'owner', ts()]);
  await audit(user.id, 'GROUP_CREATE', 'group', id, `创建团契《${name}》`, clientIp(req));

  const row = await one<any>(`${BASE(user.id)} WHERE g.id = ?`, [user.id, id]);
  return ok(mapGroup(row), 201);
});
