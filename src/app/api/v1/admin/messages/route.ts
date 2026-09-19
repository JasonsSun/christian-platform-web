import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, HttpError, notFound, readJson } from '@/server/http';
import { requireRole } from '@/server/auth';
import { notify } from '@/server/services';
import { MODULE_ORDER } from '@/lib/moderationModules';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

/**
 * 管理层私信（管理员 ↔ 审核员 ↔ 审核员）。
 *
 * 与普通用户私信(messages)完全隔离：用独立表 staff_messages，
 * 接口要求 admin/moderator 角色，普通成员既没有入口也一律 403，
 * 因此「普通用户看不到」是结构性保证，而不是靠前端隐藏。
 */

/** 会话列表 + 管理层通讯录（可一键发起新会话） */
export const GET = withApi(async (req: NextRequest) => {
  const me = await requireRole(req, ['admin', 'moderator']);

  const rows = await q<any>(
    `SELECT m.id, m.from_id, m.to_id, m.body, m.\`read\`,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM staff_messages m
      WHERE m.from_id = ? OR m.to_id = ?
      ORDER BY m.created_at DESC LIMIT 300`,
    [me.id, me.id]
  );

  const staffRows = await q<any>(
    `SELECT id, username, display_name, avatar_color, role, status
       FROM users WHERE role IN ('admin','moderator') AND status = 'active'
      ORDER BY role, created_at ASC`
  ).catch(() => [] as any[]);
  const scopeRows = await q<any>(`SELECT user_id, module FROM moderator_scopes`).catch(() => [] as any[]);

  const scopeMap = new Map<string, string[]>();
  for (const s of scopeRows) {
    const a = scopeMap.get(s.user_id) || [];
    a.push(s.module);
    scopeMap.set(s.user_id, a);
  }

  const dir = new Map<string, any>();
  for (const u of staffRows) {
    dir.set(u.id, {
      id: u.id,
      username: u.username,
      displayName: u.display_name || u.username,
      avatarColor: whiteSafeColor(u.avatar_color || '#4f6df5'),
      role: u.role,
      // 管理员天然覆盖全部模块，前端据此渲染「👑 管理员」角标
      scopes: u.role === 'admin' ? [...MODULE_ORDER] : (scopeMap.get(u.id) || []),
    });
  }

  const conv = new Map<string, any>();
  for (const m of rows) {
    const peerId = m.from_id === me.id ? m.to_id : m.from_id;
    const unreadInc = m.to_id === me.id && !m.read ? 1 : 0;
    const cur = conv.get(peerId);
    if (!cur) {
      const p = dir.get(peerId);
      conv.set(peerId, {
        peer: p || { id: peerId, username: '', displayName: '已退出管理团队', avatarColor: whiteSafeColor('#9ca3af'), role: 'member', scopes: [] },
        lastMessage: m.body,
        lastAt: m.created_at,
        unread: unreadInc,
      });
    } else {
      cur.unread += unreadInc;
    }
  }

  return ok({
    items: Array.from(conv.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)),
    staff: Array.from(dir.values()).filter((u) => u.id !== me.id),
  });
});

/** 发起/发送一条管理消息 */
export const POST = withApi(async (req: NextRequest) => {
  const me = await requireRole(req, ['admin', 'moderator']);
  const b = await readJson<{ toId?: string; body?: string }>(req);
  const toId = (b.toId || '').trim();
  const text = (b.body || '').trim();
  if (!toId) throw new HttpError(400, 'BAD_REQUEST', '缺少收件人');
  if (!text) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');
  if (toId === me.id) throw new HttpError(400, 'BAD_REQUEST', '不能给自己发消息');

  const peer = await one<any>(`SELECT id, display_name, role FROM users WHERE id = ?`, [toId]);
  if (!peer) throw notFound('用户不存在');
  if (peer.role !== 'admin' && peer.role !== 'moderator') {
    throw new HttpError(403, 'FORBIDDEN', '管理层私信只能发给管理员或审核员');
  }

  const id = newId('smsg');
  await exec(
    `INSERT INTO staff_messages (id, from_id, to_id, body, \`read\`, created_at) VALUES (?,?,?,?,0,?)`,
    [id, me.id, toId, text.slice(0, 2000), ts()]
  );
  await notify(toId, 'staff_message', `来自 ${me.display_name} 的管理消息`, text.slice(0, 60), '/admin/messages');

  return ok({ id, sent: true }, 201);
});
