import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, HttpError, notFound, readJson } from '@/server/http';
import { requireRole } from '@/server/auth';
import { notify } from '@/server/services';
import { MODULE_ORDER, isModuleKey } from '@/lib/moderationModules';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { peerId: string } };

const shape = (r: any) => ({
  id: r.id,
  body: r.body,
  read: !!r.read,
  createdAt: r.created_at,
  fromId: r.from_id,
  toId: r.to_id,
});

/** 与某位管理成员的会话内容；打开即标记已读 */
export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const me = await requireRole(req, ['admin', 'moderator']);
  const peerId = ctx.params.peerId;

  const peer = await one<any>(
    `SELECT id, username, display_name, avatar_color, role FROM users WHERE id = ?`,
    [peerId]
  );
  if (!peer) throw notFound('用户不存在');
  if (peer.role !== 'admin' && peer.role !== 'moderator') {
    throw new HttpError(403, 'FORBIDDEN', '对方不是管理团队成员');
  }

  await exec(`UPDATE staff_messages SET \`read\` = 1 WHERE from_id = ? AND to_id = ?`, [peerId, me.id]);

  const rows = await q<any>(
    `SELECT id, from_id, to_id, body, \`read\`,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM staff_messages
      WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
      ORDER BY created_at ASC LIMIT 200`,
    [me.id, peerId, peerId, me.id]
  );

  let scopes: string[] = [];
  if (peer.role === 'admin') {
    scopes = [...MODULE_ORDER];
  } else {
    const s = await q<any>(`SELECT module FROM moderator_scopes WHERE user_id = ?`, [peerId]).catch(() => [] as any[]);
    scopes = s.map((r: any) => r.module).filter(isModuleKey);
  }

  return ok({
    peer: {
      id: peer.id,
      username: peer.username,
      displayName: peer.display_name || peer.username,
      avatarColor: whiteSafeColor(peer.avatar_color || '#4f6df5'),
      role: peer.role,
      scopes,
    },
    items: rows.map(shape),
  });
});

/** 在该会话里发一条消息 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const me = await requireRole(req, ['admin', 'moderator']);
  const peerId = ctx.params.peerId;
  if (peerId === me.id) throw new HttpError(400, 'BAD_REQUEST', '不能给自己发消息');

  const peer = await one<any>(`SELECT id, display_name, role FROM users WHERE id = ?`, [peerId]);
  if (!peer) throw notFound('用户不存在');
  if (peer.role !== 'admin' && peer.role !== 'moderator') {
    throw new HttpError(403, 'FORBIDDEN', '管理层私信只能发给管理员或审核员');
  }

  const b = await readJson<{ body?: string }>(req);
  const text = (b.body || '').trim();
  if (!text) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');

  const id = newId('smsg');
  await exec(
    `INSERT INTO staff_messages (id, from_id, to_id, body, \`read\`, created_at) VALUES (?,?,?,?,0,?)`,
    [id, me.id, peerId, text.slice(0, 2000), ts()]
  );
  await notify(peerId, 'staff_message', `来自 ${me.display_name} 的管理消息`, text.slice(0, 60), '/admin/messages');

  const rows = await q<any>(
    `SELECT id, from_id, to_id, body, \`read\`,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM staff_messages WHERE id = ?`,
    [id]
  );
  return ok(shape(rows[0]), 201);
});
