import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, readJson, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { mapMessage } from '@/server/mappers';
import { notify } from '@/server/services';
import { guardWrite } from '@/server/guard';
import { canDm } from '@/server/dm';
import { ensureMessageColumns } from '@/server/messageColumns';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

type Ctx = { params: { peerId: string } };

/** 撤回时限（分钟） */
const RECALL_WINDOW_MINUTES = 2;

/** 统一字段：撤回的消息正文一律不出现在响应里，收发双方都看不到内容 */
const MSG_FIELDS = `id, from_id, to_id,
       IF(recalled_at IS NULL, body, '') AS body,
       \`read\`, attachment,
       (recalled_at IS NULL AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RECALL_WINDOW_MINUTES} MINUTE)) AS can_recall,
       DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
       DATE_FORMAT(read_at,'%Y-%m-%dT%H:%i:%sZ') AS read_at,
       DATE_FORMAT(recalled_at,'%Y-%m-%dT%H:%i:%sZ') AS recalled_at`;

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  await ensureMessageColumns();
  const user = await requireUser(req);
  const peerId = ctx.params.peerId;
  const peer = await one<any>(`SELECT id, username, display_name, avatar_color, city FROM users WHERE id = ?`, [peerId]);
  if (!peer) throw notFound('用户不存在');

  // 读消息即已读；read_at 给发送方回执用。
  // 时刻统一用 UTC_TIMESTAMP()：created_at 列存的是 UTC 字面量，混用 NOW() 会差一个时区偏移。
  await exec(`UPDATE messages SET \`read\` = 1, read_at = UTC_TIMESTAMP() WHERE from_id = ? AND to_id = ? AND \`read\` = 0`, [
    peerId,
    user.id,
  ]);

  const rows = await q<any>(
    `SELECT ${MSG_FIELDS}
     FROM messages
     WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
       AND NOT (from_id = ? AND deleted_for_from = 1)
       AND NOT (to_id   = ? AND deleted_for_to   = 1)
     ORDER BY created_at ASC LIMIT 200`,
    [user.id, peerId, peerId, user.id, user.id, user.id]
  );

  return ok({
    peer: {
      id: peer.id, username: peer.username, displayName: peer.display_name,
      avatarColor: whiteSafeColor(peer.avatar_color), city: peer.city,
    },
    items: rows.map(mapMessage),
  });
});

/** 发消息：纯文本或图片附件，二者至少其一 */
export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  await ensureMessageColumns();
  const user = await requireUser(req);
  await guardWrite(req, 'message', user.id);
  const peerId = ctx.params.peerId;
  // 隐私策略校验：拉黑 / allow_dm 限制（含"不能给自己发消息"）
  await canDm(user.id, peerId);
  const peer = await one<any>(`SELECT id, display_name FROM users WHERE id = ?`, [peerId]);
  if (!peer) throw notFound('用户不存在');

  const reqBody = await readJson<{ body?: string; attachment?: string }>(req);
  const text = (reqBody.body || '').trim();
  const attachment = (reqBody.attachment || '').trim().slice(0, 600);
  if (!text && !attachment) throw new HttpError(422, 'VALIDATION_FAILED', '消息不能为空');

  const id = newId('msg');
  await exec(
    `INSERT INTO messages (id, from_id, to_id, body, attachment, \`read\`, created_at)
     VALUES (?,?,?,?,?,0,?)`,
    [id, user.id, peerId, text.slice(0, 2000), attachment || null, ts()]
  );
  await notify(
    peer.id,
    'new_message',
    `来自 ${user.display_name} 的消息`,
    text ? text.slice(0, 60) : '[图片]',
    `/messages/${user.id}`
  );

  const rows = await q<any>(`SELECT ${MSG_FIELDS} FROM messages WHERE id = ?`, [id]);
  return ok(mapMessage(rows[0]), 201);
});

/**
 * 撤回：仅发送方可撤，限 2 分钟内。
 * 时限判断放在 SQL 里用 NOW()，不把 JS 时间传进去比较。
 */
export const PATCH = withApi(async (req: NextRequest, ctx: Ctx) => {
  await ensureMessageColumns();
  const user = await requireUser(req);
  const peerId = ctx.params.peerId;
  const reqBody = await readJson<{ messageId?: string }>(req);
  const messageId = (reqBody.messageId || '').trim();
  if (!messageId) throw new HttpError(400, 'BAD_REQUEST', '缺少 messageId');

  const target = await one<{ id: string; recallable: number }>(
    `SELECT id, (created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RECALL_WINDOW_MINUTES} MINUTE)) AS recallable
       FROM messages WHERE id = ? AND from_id = ? AND to_id = ? AND recalled_at IS NULL`,
    [messageId, user.id, peerId]
  );
  if (!target) throw notFound('消息不存在或已撤回');
  if (!Number(target.recallable)) {
    throw new HttpError(400, 'RECALL_EXPIRED', `超过 ${RECALL_WINDOW_MINUTES} 分钟的消息不能撤回`);
  }

  await exec(`UPDATE messages SET recalled_at = UTC_TIMESTAMP(), body = '' WHERE id = ?`, [messageId]);
  return ok({ id: messageId, recalled: true });
});

/**
 * 删除：一条消息在收发双方之间是同一条记录，所以删除必须分侧。
 * - ?messageId=xxx 删除单条
 * - ?all=1        清空整个会话（只对自己隐藏，对方不受影响）
 */
export const DELETE = withApi(async (req: NextRequest, ctx: Ctx) => {
  await ensureMessageColumns();
  const user = await requireUser(req);
  const peerId = ctx.params.peerId;
  const sp = new URL(req.url).searchParams;
  const messageId = (sp.get('messageId') || '').trim();
  const clearAll = sp.get('all') === '1';

  if (!messageId && !clearAll) throw new HttpError(400, 'BAD_REQUEST', '缺少 messageId 或 all=1');

  if (clearAll) {
    // 自己发出去的 -> deleted_for_from；别人发给我的 -> deleted_for_to
    await exec(`UPDATE messages SET deleted_for_from = 1 WHERE from_id = ? AND to_id = ?`, [user.id, peerId]);
    await exec(`UPDATE messages SET deleted_for_to = 1 WHERE from_id = ? AND to_id = ?`, [peerId, user.id]);
    return ok({ cleared: true, peerId });
  }

  const rows = await q<any>(
    `SELECT from_id, to_id FROM messages
      WHERE id = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
    [messageId, user.id, peerId, peerId, user.id]
  );
  if (!rows.length) throw notFound('消息不存在');

  // 两条只会命中一侧，另一条自然 0 行
  await exec(`UPDATE messages SET deleted_for_from = 1 WHERE id = ? AND from_id = ?`, [messageId, user.id]);
  await exec(`UPDATE messages SET deleted_for_to = 1 WHERE id = ? AND to_id = ?`, [messageId, user.id]);
  return ok({ id: messageId, deleted: true });
});
