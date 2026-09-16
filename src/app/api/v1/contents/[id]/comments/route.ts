import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, readJson, HttpError } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { mapComment } from '@/server/mappers';
import { guardWrite } from '@/server/guard';
import { dispatchOutbox, emit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withApi(async (req: NextRequest, ctx: Ctx) => {
  const id = ctx.params.id;
  const rows = await q<any>(
    `SELECT cm.id, cm.body, DATE_FORMAT(cm.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color
     FROM comments cm JOIN users u ON u.id = cm.user_id
     WHERE cm.content_id = ? ORDER BY cm.created_at ASC`, [id]
  );
  return ok({ items: rows.map(mapComment), total: rows.length });
});

export const POST = withApi(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser(req);
  await guardWrite(req, 'comment', user.id);
  const id = ctx.params.id;
  const content = await one<any>(`SELECT id FROM contents WHERE id = ?`, [id]);
  if (!content) throw notFound('内容不存在');

  const body = await readJson<{ body?: string }>(req);
  const text = (body.body || '').trim();
  if (text.length < 1) throw new HttpError(422, 'VALIDATION_FAILED', '评论不能为空');
  if (text.length > 1000) throw new HttpError(422, 'VALIDATION_FAILED', '评论最多 1000 字');

  const cid = newId('cmt');
  await exec(`INSERT INTO comments (id, content_id, user_id, body, created_at) VALUES (?,?,?,?,?)`,
    [cid, id, user.id, text, ts()]);
  await exec(`UPDATE contents SET comment_count = comment_count + 1 WHERE id = ?`, [id]);

  // @提及：解析 @username / @昵称，给被提及的人发站内通知（去重、最多 10 个、排除自己）
  const mentions = Array.from(
    new Set(Array.from(text.matchAll(/@([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})/g)).map((m) => m[1]))
  ).slice(0, 10);
  if (mentions.length) {
    const ph = mentions.map(() => '?').join(',');
    const mentioned = await q<{ id: string }>(
      `SELECT id FROM users WHERE status = 'active' AND (username IN (${ph}) OR display_name IN (${ph}))`,
      [...mentions, ...mentions]
    );
    for (const m of mentioned) {
      if (m.id === user.id) continue;
      await notify(m.id, 'mention', `${user.display_name} 在评论中提到了你`, text.slice(0, 80), `/contents/${id}`);
    }
  }

  await emit('comment.created', { contentId: id, actorId: user.id, actorName: user.display_name });
  await dispatchOutbox();

  const rows = await q<any>(
    `SELECT cm.id, cm.body, DATE_FORMAT(cm.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_color
     FROM comments cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?`, [cid]
  );
  return ok(mapComment(rows[0]), 201);
});
