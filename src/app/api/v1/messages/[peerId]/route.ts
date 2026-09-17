import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, readJson, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { mapMessage } from '@/server/mappers';
import { notify } from '@/server/services';
import { guardWrite } from '@/server/guard';
import { canDm } from '@/server/dm';

export const dynamic = 'force-dynamic';

type Ctx = { params: { peerId: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  const peerId = ctx.params.peerId;
  const peer = await one<any>(`SELECT id, username, display_name, avatar_color, city FROM users WHERE id = ?`, [peerId]);
  if (!peer) throw notFound('用户不存在');

  await exec(`UPDATE messages SET \`read\` = 1 WHERE from_id = ? AND to_id = ?`, [peerId, user.id]);

  const rows = await q<any>(
    `SELECT id, from_id, to_id, body, \`read\`, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM messages
     WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
     ORDER BY created_at ASC LIMIT 200`,
    [user.id, peerId, peerId, user.id]
  );

  return ok({
    peer: {
      id: peer.id, username: peer.username, displayName: peer.display_name,
      avatarColor: peer.avatar_color, city: peer.city,
    },
    items: rows.map(mapMessage),
  });
});

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  await guardWrite(req, 'message', user.id);
  const peerId = ctx.params.peerId;
  // 隐私策略校验：拉黑 / allow_dm 限制（含"不能给自己发消息"）
  await canDm(user.id, peerId);
  const peer = await one<any>(`SELECT id, display_name FROM users WHERE id = ?`, [peerId]);
  if (!peer) throw notFound('用户不存在');

  const body = await readJson<{ body?: string }>(req);
  const text = (body.body || '').trim();
  if (!text) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');

  const id = newId('msg');
  await exec(`INSERT INTO messages (id, from_id, to_id, body, \`read\`, created_at) VALUES (?,?,?,?,0,?)`,
    [id, user.id, peerId, text.slice(0, 2000), ts()]);
  await notify(peer.id, 'new_message', `来自 ${user.display_name} 的消息`, text.slice(0, 60), `/messages/${user.id}`);

  const rows = await q<any>(
    `SELECT id, from_id, to_id, body, \`read\`, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM messages WHERE id = ?`, [id]
  );
  return ok(mapMessage(rows[0]), 201);
});
