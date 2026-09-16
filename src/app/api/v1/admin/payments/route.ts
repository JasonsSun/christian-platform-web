import { NextRequest } from 'next/server';
import { exec } from '@/server/db';
import { ok, withApi, readJson, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { ts } from '@/server/db';
import { clearSettingsCache, getSetting } from '@/server/settings';
import { packSecret, unpackSecret } from '@/server/secret';
import { ensurePaymentColumns } from '@/server/paymentColumns';
import { onlinePaymentEnabled } from '@/server/payments';

export const dynamic = 'force-dynamic';

/**
 * 后台「支付配置」(仅管理员)。
 *
 * 支付网关的商户密钥优先从 settings 表读取（加密存储），未配置时回退到 .env。
 * 本接口只返回「是否已配置」的掩码状态，**绝不回传明文密钥**；
 * 保存时用 AES-256-GCM 加密后落库，改完即清缓存，无需重启服务。
 *
 * 客户端约定：提交的字段值 '****' 表示「保持原值不变」，
 * '__CLEAR__' 表示「清空该密钥」。
 */

type FieldMeta = { key: string; label: string; group: string; secret: boolean; hint?: string };

const FIELDS: FieldMeta[] = [
  { key: 'alipay_app_id', label: '应用 APP_ID', group: 'alipay', secret: false },
  { key: 'alipay_private_key', label: '应用私钥 (RSA2)', group: 'alipay', secret: true, hint: 'PKCS8 格式 PEM，含 BEGIN/END 行' },
  { key: 'alipay_public_key', label: '支付宝公钥', group: 'alipay', secret: true, hint: '用于异步回调验签' },
  { key: 'wechat_mchid', label: '商户号 MchID', group: 'wechat', secret: false },
  { key: 'wechat_api_v3_key', label: 'APIv3 密钥', group: 'wechat', secret: true },
  { key: 'wechat_private_key', label: '商户 API 私钥', group: 'wechat', secret: true, hint: 'apiclient_key.pem 内容' },
  { key: 'stripe_secret_key', label: 'Secret Key', group: 'stripe', secret: true, hint: 'sk_live_… / sk_test_…' },
  { key: 'stripe_webhook_secret', label: 'Webhook Secret', group: 'stripe', secret: true, hint: 'whsec_…' },
];

const KEEP = '****';
const CLEAR = '__CLEAR__';

/** 密钥配置列表（脱敏：只回是否已配置，不回明文） */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin']);
  await ensurePaymentColumns();
  const fields = await Promise.all(
    FIELDS.map(async (f) => {
      const raw = (await getSetting(f.key, '')).trim();
      // 非敏感字段（APP_ID / 商户号）回显明文方便修改；敏感字段只回「是否已配置」。
      const value = !f.secret && raw ? unpackSecret(raw) : '';
      return { key: f.key, label: f.label, group: f.group, secret: f.secret, hint: f.hint || '', set: !!raw, value };
    })
  );
  return ok({ fields, onlineEnabled: await onlinePaymentEnabled() });
});

/** 保存密钥（加密落库）。只处理提交上来的字段，其余保持不变。 */
export const PUT = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<{ fields?: Record<string, string> }>(req);
  const incoming = body.fields && typeof body.fields === 'object' ? body.fields : {};
  await ensurePaymentColumns();

  let updated = 0;
  for (const f of FIELDS) {
    if (!(f.key in incoming)) continue;
    const raw = String(incoming[f.key] ?? '');
    if (raw === KEEP) continue;            // 保持原值
    const clear = raw === CLEAR;
    const val = clear ? '' : raw.trim();
    const stored = val ? packSecret(val) : '';
    await exec(
      `INSERT INTO settings (key_name, value, label, group_name, updated_at, updated_by)
       VALUES (?, ?, ?, 'payment', ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), label = VALUES(label),
         updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
      [f.key, stored, f.label, ts(), admin.id]
    );
    updated++;
  }

  // 配置落库后立即失效进程内缓存，否则最长 30s 才生效
  clearSettingsCache();
  await audit(admin.id, 'PAYMENT_CONFIG_UPDATE', 'payment', '', `更新 ${updated} 项支付配置`, clientIp(req));
  return ok({ updated });
});

/** 兼容 PATCH（与 PUT 等价） */
export const PATCH = PUT;
