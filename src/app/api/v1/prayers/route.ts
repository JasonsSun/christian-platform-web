import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, num } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapPrayer } from '@/server/mappers';

export const dynamic = 'force-dynamic';

const BASE = (viewerId?: string) => `
  SELECT p.id, p.body, p.amen_count, p.answered,
         DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
         u.id AS user_id, u.username, u.display_name, u.avatar_color,
         ${viewerId ? `EXISTS(SELECT 1 FROM prayer_amens a WHERE a.prayer_id = p.id AND a.user_id = ?)` : '0'} AS amened
  FROM prayers p JOIN users u ON u.id = p.user_id`;

export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const viewer = (await currentUser(req)) as UserRow | null;
  const scope = sp.get('scope') || 'all';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);

  const args: any[] = [];
  if (viewer) args.push(viewer.id);
  const where: string[] = [];
  if (scope === 'mine' && viewer) { where.push('p.user_id = ?'); args.push(viewer.id); }
  if (scope === 'answered') where.push('p.answered = 1');
  if (scope === 'unanswered') where.push('p.answered = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `${BASE(viewer?.id)} ${whereSql} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM prayers p ${whereSql}`,
    args.filter((_, i) => !(viewer && i === 0)));
  return ok({ items: rows.map(mapPrayer), total: Number(total?.c || 0), page, pageSize });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<{ body?: string }>(req);
  const text = (body.body || '').trim();
  if (text.length < 5) throw new HttpError(422, 'VALIDATION_FAILED', '代祷内容至少 5 个字');

  const id = newId('pry');
  await exec(`INSERT INTO prayers (id, user_id, body, amen_count, answered, created_at) VALUES (?,?,?,0,0,?)`,
    [id, user.id, text.slice(0, 1000), ts()]);
  const row = await one<any>(`${BASE(user.id)} WHERE p.id = ?`, [user.id, id]);
  return ok(mapPrayer(row), 201);
});
