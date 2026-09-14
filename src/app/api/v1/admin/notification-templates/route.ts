import { NextRequest } from 'next/server';
import { exec, q, ts, newId } from '@/server/db';
import { ok, withApi, readJson, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';

export const dynamic = 'force-dynamic';

const CHANNELS = ['inapp', 'push', 'email', 'sms', 'wechat'];
const CODE_RE = /^[a-z][a-z0-9_]{1,62}$/;

/** 通知模板:新增 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{
    code?: string; channel?: string; titleTpl?: string; bodyTpl?: string; enabled?: boolean;
  }>(req);

  const code = String(body.code || '').trim();
  const channel = String(body.channel || 'inapp').trim();
  const titleTpl = String(body.titleTpl || '').trim();
  const bodyTpl = String(body.bodyTpl || '').trim();

  if (!CODE_RE.test(code)) {
    throw new HttpError(400, 'BAD_REQUEST', '编码只能用英文小写字母、数字和下划线，且以字母开头（2–63 位）');
  }
  if (!CHANNELS.includes(channel)) throw new HttpError(400, 'BAD_REQUEST', '渠道不合法');
  if (!titleTpl) throw new HttpError(400, 'BAD_REQUEST', '标题模板不能为空');
  if (titleTpl.length > 200) throw new HttpError(400, 'BAD_REQUEST', '标题模板不能超过 200 字');
  if (bodyTpl.length > 500) throw new HttpError(400, 'BAD_REQUEST', '正文模板不能超过 500 字');

  const dup = await q<any>(
    `SELECT id FROM notification_templates WHERE code = ? AND channel = ? LIMIT 1`,
    [code, channel]
  );
  if (dup.length) throw new HttpError(409, 'CONFLICT', `已存在「${code} / ${channel}」的模板，请换编码或渠道`);

  const id = newId('nt');
  await exec(
    `INSERT INTO notification_templates (id, code, channel, title_tpl, body_tpl, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, code, channel, titleTpl, bodyTpl, body.enabled === false ? 0 : 1, ts()]
  );
  await audit(admin.id, 'NOTIF_TEMPLATE_CREATE', 'notification_templates', id, `新增模板 ${code}/${channel}`, clientIp(req));
  return ok({ id, ok: true });
});
