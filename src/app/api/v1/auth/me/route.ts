import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { publicUser, requireUser, userStats, UserRow } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (req: NextRequest) => {
  const user: UserRow = await requireUser(req);
  const stats = await userStats(user.id);
  const unread = await one<any>(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND \`read\`=0`, [user.id]);
  const groups = await q<any>(`SELECT COUNT(*) c FROM group_members WHERE user_id=?`, [user.id]);
  return ok({
    ...publicUser(user),
    stats: { ...stats, groups: Number(groups[0]?.c || 0), unread: Number(unread?.c || 0) },
  });
});

export const PATCH = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const allowed = ['display_name', 'bio', 'city', 'church'];
  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string, string> = {
    displayName: 'display_name',
    bio: 'bio',
    city: 'city',
    church: 'church',
  };
  for (const [k, v] of Object.entries(body || {})) {
    const col = allowed.includes(k) ? k : map[k];
    if (col && allowed.includes(col) && typeof v === 'string') {
      fields.push(`${col}=?`);
      values.push(v.slice(0, 255));
    }
  }
  if (!fields.length) throw new HttpError(400, 'BAD_REQUEST', '没有可更新的字段');
  values.push(user.id);
  await exec(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values);
  const updated = await one<UserRow>(`SELECT * FROM users WHERE id=?`, [user.id]);
  return ok(publicUser(updated!));
});
