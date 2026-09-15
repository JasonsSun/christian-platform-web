import { NextRequest } from 'next/server';
import { ok, withApi, readJson, badRequest } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getPrefs, savePrefs, inQuietHours } from '@/server/notify';
import { smtpConfigured } from '@/server/channels/email';
import { wechatConfigured } from '@/server/channels/wechat';

export const dynamic = 'force-dynamic';

const bool = (v: any) => v === true || v === 1 || v === '1' || v === 'true';

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const prefs = await getPrefs(user.id);
  return ok({
    prefs,
    // 通道可用性:前端据此提示「未配置 SMTP」等,避免用户开了开关却收不到
    channels: {
      inapp: true,
      email: { available: smtpConfigured(), hasAddress: !!user.email },
      wechat: { available: wechatConfigured(), bound: false },
      sms: { available: false },
    },
    inQuietHoursNow: inQuietHours(prefs),
  });
});

export const PUT = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<any>(req);
  const p = body?.prefs ?? body ?? {};
  if (p.digest && !['realtime', 'daily', 'off'].includes(p.digest)) throw badRequest('digest 只能是 realtime/daily/off');
  if (p.quietFrom && !/^\d{2}:\d{2}$/.test(p.quietFrom)) throw badRequest('quietFrom 格式应为 HH:mm');
  if (p.quietTo && !/^\d{2}:\d{2}$/.test(p.quietTo)) throw badRequest('quietTo 格式应为 HH:mm');
  if (p.remindReadAt && !/^\d{2}:\d{2}$/.test(p.remindReadAt)) throw badRequest('remindReadAt 格式应为 HH:mm');
  if (p.remindDevotionAt && !/^\d{2}:\d{2}$/.test(p.remindDevotionAt)) throw badRequest('remindDevotionAt 格式应为 HH:mm');

  const prefs = await savePrefs(user.id, {
    inapp: p.inapp === undefined ? undefined : bool(p.inapp),
    email: p.email === undefined ? undefined : bool(p.email),
    wechat: p.wechat === undefined ? undefined : bool(p.wechat),
    sms: p.sms === undefined ? undefined : bool(p.sms),
    quietEnabled: p.quietEnabled === undefined ? undefined : bool(p.quietEnabled),
    quietFrom: p.quietFrom,
    quietTo: p.quietTo,
    digest: p.digest,
    remindEnabled: p.remindEnabled === undefined ? undefined : bool(p.remindEnabled),
    remindReadAt: p.remindReadAt,
    remindDevotionAt: p.remindDevotionAt,
  });
  return ok({ prefs, inQuietHoursNow: inQuietHours(prefs) });
});

/** 允许用 PATCH 部分更新(前端 apiPatch 默认走 PATCH) */
export const PATCH = PUT;
