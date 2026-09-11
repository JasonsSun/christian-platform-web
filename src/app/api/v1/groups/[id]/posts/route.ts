import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, forbidden, readJson, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { dispatchOutbox, emit } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const groupId = ctx.params.id;
  const member = await one<any>(`SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?`, [groupId, user.id]);
  if (!member) throw forbidden('只有团契成员可以发言');

  const body = await readJson<{ body?: string }>(req);
  const text = (body.body || '').trim();
  if (!text) throw new HttpError(422, 'VALIDATION_FAILED', '内容不能为空');

  const id = newId('gps');
  await exec(`INSERT INTO group_posts (id, group_id, user_id, body, created_at) VALUES (?,?,?,?,?)`,
    [id, groupId, user.id, text.slice(0, 2000), ts()]);
  await emit('group.posted', { groupId, actorId: user.id, actorName: user.display_name });
  await dispatchOutbox();

  const rows = await q<any>(
    `SELECT p.id, p.body, DATE_FORMAT(p.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color
     FROM group_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`, [id]
  );
  const r = rows[0];
  return ok({
    id: r.id, body: r.body, createdAt: r.created_at,
    user: { id: r.user_id, username: r.username, displayName: r.display_name, avatarColor: r.avatar_color },
  }, 201);
});
