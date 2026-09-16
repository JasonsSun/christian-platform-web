import { NextRequest } from 'next/server';
import { exec, q } from '@/server/db';
import { ok, withApi, readJson, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { ts } from '@/server/db';
import { clearSettingsCache } from '@/server/settings';

export const dynamic = 'force-dynamic';

/** 系统设置:读取全部配置项（仅管理员——属系统级治理，不下放模块审核员） */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  // 支付网关密钥(payment 组)含敏感密文，走专用接口 /admin/payments，不在此处暴露。
  const rows = await q<any>(
    `SELECT key_name, value, label, group_name,
            DATE_FORMAT(updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM settings WHERE group_name <> 'payment' ORDER BY group_name, key_name`
  );
  return ok({
    items: rows.map((r) => ({
      key: r.key_name, value: r.value, label: r.label, group: r.group_name, updatedAt: r.updated_at,
    })),
  });
});

/** 系统设置:批量更新 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ items?: { key: string; value: string }[] }>(req);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(400, 'BAD_REQUEST', '缺少更新项');
  for (const it of items) {
    if (!it.key) continue;
    await exec(
      `UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key_name = ?`,
      [String(it.value ?? ''), ts(), admin.id, it.key]
    );
  }
  // 配置落库后立即失效进程内缓存，否则最长 30s 才生效
  clearSettingsCache();
  await audit(admin.id, 'SETTINGS_UPDATE', 'settings', '', `更新 ${items.length} 项配置`, clientIp(req));
  return ok({ updated: items.length });
});
