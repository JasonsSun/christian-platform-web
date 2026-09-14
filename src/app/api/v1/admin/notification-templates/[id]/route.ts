import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

const CHANNELS = ['inapp', 'push', 'email', 'sms', 'wechat'];
const CODE_RE = /^[a-z][a-z0-9_]{1,62}$/;

/** 通知模板:更新（含启用/停用） */
export const PATCH = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const id = ctx.params.id;
  const exist = await one<any>(`SELECT * FROM notification_templates WHERE id = ?`, [id]);
  if (!exist) throw new HttpError(404, 'NOT_FOUND', '模板不存在');

  const body = await readJson<{
    code?: string; channel?: string; titleTpl?: string; bodyTpl?: string; enabled?: boolean;
  }>(req);

  const next = {
    code: body.code === undefined ? exist.code : String(body.code).trim(),
    channel: body.channel === undefined ? exist.channel : String(body.channel).trim(),
    title_tpl: body.titleTpl === undefined ? exist.title_tpl : String(body.titleTpl).trim(),
    body_tpl: body.bodyTpl === undefined ? exist.body_tpl : String(body.bodyTpl).trim(),
    enabled: body.enabled === undefined ? !!exist.enabled : !!body.enabled,
  };

  if (!CODE_RE.test(next.code)) {
    throw new HttpError(400, 'BAD_REQUEST', '编码只能用英文小写字母、数字和下划线，且以字母开头（2–63 位）');
  }
  if (!CHANNELS.includes(next.channel)) throw new HttpError(400, 'BAD_REQUEST', '渠道不合法');
  if (!next.title_tpl) throw new HttpError(400, 'BAD_REQUEST', '标题模板不能为空');
  if (next.title_tpl.length > 200) throw new HttpError(400, 'BAD_REQUEST', '标题模板不能超过 200 字');
  if (next.body_tpl.length > 500) throw new HttpError(400, 'BAD_REQUEST', '正文模板不能超过 500 字');

  const dup = await q<any>(
    `SELECT id FROM notification_templates WHERE code = ? AND channel = ? AND id <> ? LIMIT 1`,
    [next.code, next.channel, id]
  );
  if (dup.length) throw new HttpError(409, 'CONFLICT', `已存在「${next.code} / ${next.channel}」的模板`);

  await exec(
    `UPDATE notification_templates SET code = ?, channel = ?, title_tpl = ?, body_tpl = ?, enabled = ? WHERE id = ?`,
    [next.code, next.channel, next.title_tpl, next.body_tpl, next.enabled ? 1 : 0, id]
  );
  await audit(
    admin.id,
    'NOTIF_TEMPLATE_UPDATE',
    'notification_templates',
    id,
    `更新模板 ${next.code}/${next.channel}${body.enabled !== undefined ? (next.enabled ? '（启用）' : '（停用）') : ''}`,
    clientIp(req)
  );
  return ok({ ok: true, updatedAt: ts() });
});

/** 通知模板:删除 */
export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const id = ctx.params.id;
  const exist = await one<any>(`SELECT code, channel FROM notification_templates WHERE id = ?`, [id]);
  if (!exist) throw new HttpError(404, 'NOT_FOUND', '模板不存在');

  await exec(`DELETE FROM notification_templates WHERE id = ?`, [id]);
  await audit(
    admin.id,
    'NOTIF_TEMPLATE_DELETE',
    'notification_templates',
    id,
    `删除模板 ${exist.code}/${exist.channel}`,
    clientIp(req)
  );
  return ok({ ok: true });
});
