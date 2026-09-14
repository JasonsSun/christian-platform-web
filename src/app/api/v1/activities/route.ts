import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, clientIp, num } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapActivity } from '@/server/mappers';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

const BASE = (viewerId?: string) => `
  SELECT a.id, a.title, a.description, a.category, a.location, a.city, a.capacity, a.cover, a.status,
         DATE_FORMAT(a.start_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
         DATE_FORMAT(a.end_at,'%Y-%m-%dT%H:%i:%sZ') AS end_at,
         DATE_FORMAT(a.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
         u.id AS organizer_id, u.username AS organizer_username,
         u.display_name AS organizer_name, u.avatar_color AS organizer_color,
         (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status = 'confirmed') AS confirmed_count,
         (SELECT COUNT(*) FROM activity_registrations r WHERE r.activity_id = a.id AND r.status = 'waitlist') AS waitlist_count,
         ${viewerId
           ? `(SELECT r.status FROM activity_registrations r WHERE r.activity_id = a.id AND r.user_id = ? AND r.status <> 'cancelled' LIMIT 1)`
           : 'NULL'} AS my_status
  FROM activities a JOIN users u ON u.id = a.organizer_id`;

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as UserRow | null;
  const scope = sp.get('scope') || 'upcoming';
  const city = sp.get('city') || '';
  const category = sp.get('category') || '';
  const keyword = (sp.get('q') || '').trim();
  const sort = sp.get('sort') || 'upcoming';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 12), 50);

  const args: any[] = [];
  if (viewer) args.push(viewer.id);
  const where: string[] = ["a.status = 'published'"];
  if (scope === 'upcoming') where.push('a.start_at >= NOW()');
  if (scope === 'past') where.push('a.start_at < NOW()');
  if (city) { where.push('a.city = ?'); args.push(city); }
  if (category) { where.push('a.category = ?'); args.push(category); }
  if (keyword) { where.push('(a.title LIKE ? OR a.description LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const orderBy = sort === 'latest' ? 'a.created_at DESC' : 'a.start_at ASC';
  const rows = await q<any>(
    `${BASE(viewer?.id)} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM activities a ${whereSql}`,
    args.filter((_, i) => !(viewer && i === 0)));

  return ok({
    items: rows.map((r) => mapActivity({ ...r, registered: !!r.my_status })),
    total: Number(total?.c || 0), page, pageSize,
  });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<{
    title?: string; description?: string; category?: string; location?: string;
    city?: string; startAt?: string; endAt?: string; capacity?: number; cover?: string;
  }>(req);

  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  if (title.length < 2) throw new HttpError(422, 'VALIDATION_FAILED', '活动标题至少 2 个字');
  if (description.length < 5) throw new HttpError(422, 'VALIDATION_FAILED', '活动介绍至少 5 个字');
  const startAt = body.startAt ? new Date(body.startAt) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) throw new HttpError(422, 'VALIDATION_FAILED', '开始时间无效');

  const id = newId('act');
  await exec(
    `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, end_at, capacity, cover, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'published',?)`,
    [id, user.id, title, description, body.category || 'fellowship', body.location || '', body.city || '',
     ts(startAt), body.endAt ? ts(new Date(body.endAt)) : ts(new Date(startAt.getTime() + 7200000)),
     Math.max(1, Number(body.capacity || 50)), body.cover || '📅', ts()]
  );

  // 创建人默认就是第一参与人，无需自己报名。
  // 用 INSERT ... ON DUPLICATE KEY 兜底 uk_reg(activity_id, user_id) 唯一键，避免重复插入报错。
  await exec(
    `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at)
     VALUES (?,?,?,'confirmed',?)
     ON DUPLICATE KEY UPDATE status='confirmed'`,
    [newId('reg'), id, user.id, ts()]
  );

  await audit(user.id, 'ACTIVITY_CREATE', 'activity', id, `创建活动《${title}》`, clientIp(req));

  const row = await one<any>(`${BASE(user.id)} WHERE a.id = ?`, [user.id, id]);
  return ok(mapActivity({ ...row, registered: true }), 201);
});
