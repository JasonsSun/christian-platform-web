'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import DailyReminderSettings from '@/components/DailyReminderSettings';

type Digest = 'realtime' | 'daily' | 'off';

type Prefs = {
  inapp: boolean;
  email: boolean;
  wechat: boolean;
  sms: boolean;
  quietEnabled: boolean;
  quietFrom: string;
  quietTo: string;
  digest: Digest;
  remindEnabled: boolean;
  remindReadAt: string;
  remindDevotionAt: string;
};

type PrefsPayload = {
  prefs: Prefs;
  channels: {
    inapp: boolean;
    email: { available: boolean; hasAddress: boolean };
    wechat: { available: boolean; bound: boolean };
    sms: { available: boolean };
  };
  inQuietHoursNow: boolean;
};

type BindState = {
  bound: boolean;
  openidMasked: string;
  nickname: string;
  boundAt: string | null;
  wechatEnabled: boolean;
  pending: { token: string; scene: string; expiresAt: string } | null;
};

const CHANNELS: { key: keyof Pick<Prefs, 'inapp' | 'email' | 'wechat' | 'sms'>; label: string; desc: string; icon: string }[] = [
  { key: 'inapp', label: '站内通知', desc: '回到站点即可看到，无门槛', icon: '🔔' },
  { key: 'email', label: '邮件', desc: '零成本兜底，需配置 SMTP', icon: '✉️' },
  { key: 'wechat', label: '微信', desc: '服务号模板消息，需先绑定', icon: '💬' },
  { key: 'sms', label: '短信', desc: '付费通道，仅活动强提醒使用', icon: '📱' },
];

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  // 直接读 location,避免 useSearchParams 触发静态预渲染的 Suspense 要求
  const [wxResult, setWxResult] = useState<string | null>(null);
  const [wxMsg, setWxMsg] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setWxResult(q.get('wechat'));
    setWxMsg(q.get('msg'));
  }, []);

  const path = user ? '/me/notification-prefs' : null;
  const { data, loading, reload } = useApi<PrefsPayload>(path, [user?.id]);
  const { run, pending } = useAction();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [bind, setBind] = useState<BindState | null>(null);
  const [qr, setQr] = useState<{ qrSvg: string; scene: string; expiresAt: string; mode: string } | null>(null);
  const [toast, setToast] = useState<string>('');

  useEffect(() => {
    if (data?.prefs) setPrefs(data.prefs);
  }, [data?.prefs]);

  useEffect(() => {
    if (!user) return;
    apiGet<BindState>('/me/wechat/bind').then(setBind).catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (wxResult === 'bound') setToast('微信绑定成功');
    else if (wxResult === 'error') setToast(`绑定失败：${wxMsg || '未知原因'}`);
    if (wxResult) router.replace('/settings/notifications');
  }, [wxResult, wxMsg, router]);

  // 待绑定二维码有效期内轮询结果
  const polling = useRef(false);
  useEffect(() => {
    if (!qr || bind?.bound) return;
    const timer = setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const s = await apiGet<BindState>('/me/wechat/bind');
        setBind(s);
        if (s.bound) {
          setQr(null);
          setToast('微信绑定成功');
          reload();
        }
      } finally {
        polling.current = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qr, bind?.bound, reload]);

  const save = useCallback(
    async (patch: Partial<Prefs>) => {
      if (!prefs) return;
      const next = { ...prefs, ...patch };
      setPrefs(next);
      const res = await run(() => apiPatch<{ prefs: Prefs }>('/me/notification-prefs', { prefs: next }));
      if (res) setToast('已保存');
    },
    [prefs, run]
  );

  async function newQr() {
    const res = await run(() =>
      apiPost<{ qrSvg: string; scene: string; expiresAt: string; mode: string }>('/me/wechat/bind-token', {})
    );
    if (res) setQr(res);
  }

  async function unbind() {
    await run(() => apiDelete('/me/wechat/bind'));
    setBind(await apiGet<BindState>('/me/wechat/bind'));
    setQr(null);
    setToast('已解除绑定');
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后管理你的提醒方式</p>
        <button onClick={() => router.push('/login')} className="btn-primary">去登录</button>
      </div>
    );
  }

  const ch = data?.channels;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">提醒设置</h1>
      <p className="text-ink-500 text-sm mb-6">选择你希望接收提醒的方式。站内通知始终可用，其余通道需要额外配置或绑定。</p>

      {toast && (
        <div className="mb-5 px-4 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 text-sm">
          {toast}
        </div>
      )}

      {loading && !prefs && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-ink-100" />
          ))}
        </div>
      )}

      {/* 通道开关 */}
      <section className="space-y-3">
        {CHANNELS.map((c) => {
          const on = prefs?.[c.key] ?? false;
          const meta = c.key === 'email' ? ch?.email : c.key === 'wechat' ? ch?.wechat : c.key === 'sms' ? ch?.sms : { available: true };
          const unavailable = c.key !== 'inapp' && !meta?.available;
          return (
            <div key={c.key} className="bg-white rounded-2xl border border-ink-100 shadow-soft p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-ink-100 flex items-center justify-center text-xl flex-shrink-0">{c.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-ink-900">{c.label}</h2>
                  {unavailable && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">未配置</span>
                  )}
                </div>
                <p className="text-sm text-ink-500 mt-0.5">{c.desc}</p>
              </div>
              <button
                disabled={pending || c.key === 'inapp'}
                onClick={() => save({ [c.key]: !on } as Partial<Prefs>)}
                aria-label={c.label}
                // 开关只有圆点位移这一处视觉差异，读屏要靠 aria-pressed 才知道当前是开还是关
                aria-pressed={on}
                className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${
                  on ? 'bg-primary-500' : 'bg-ink-200'
                }`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform mx-1 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          );
        })}
      </section>

      {/* 每日提醒 */}
      <DailyReminderSettings prefs={prefs} onChange={save} />

      {/* 免打扰与频率 */}
      <section className="mt-6 bg-white rounded-2xl border border-ink-100 shadow-soft p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-ink-900">免打扰时段</h2>
            <p className="text-sm text-ink-500 mt-0.5">该时段内只累积站内通知，外发投递顺延</p>
          </div>
          <button
            disabled={pending}
            onClick={() => save({ quietEnabled: !prefs?.quietEnabled })}
            aria-label="免打扰时段"
            aria-pressed={!!prefs?.quietEnabled}
            className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${prefs?.quietEnabled ? 'bg-primary-500' : 'bg-ink-200'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform mx-1 ${prefs?.quietEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {prefs?.quietEnabled && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-ink-100">
            <label className="sr-only" htmlFor="quiet-from">
              免打扰开始时间
            </label>
            <input
              id="quiet-from"
              name="quietFrom"
              type="time" value={prefs.quietFrom}
              onChange={(e) => setPrefs({ ...prefs, quietFrom: e.target.value })}
              onBlur={() => save({ quietFrom: prefs.quietFrom })}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
            />
            <span className="text-ink-400">至</span>
            <label className="sr-only" htmlFor="quiet-to">
              免打扰结束时间
            </label>
            <input
              id="quiet-to"
              name="quietTo"
              type="time" value={prefs.quietTo}
              onChange={(e) => setPrefs({ ...prefs, quietTo: e.target.value })}
              onBlur={() => save({ quietTo: prefs.quietTo })}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
            />
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-ink-100">
          <h2 id="digest-label" className="font-semibold text-ink-900 mb-2">外发频率</h2>
          <div className="flex gap-1 bg-ink-100/60 rounded-xl p-1" role="group" aria-labelledby="digest-label">
            {([['realtime', '实时'], ['daily', '每日汇总'], ['off', '仅站内']] as [Digest, string][]).map(([k, label]) => (
              <button
                key={k}
                disabled={pending}
                onClick={() => save({ digest: k })}
                aria-pressed={prefs?.digest === k}
                className={`flex-1 min-w-0 whitespace-nowrap px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  prefs?.digest === k ? 'bg-white text-primary-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 微信绑定 */}
      <section className="mt-6 bg-white rounded-2xl border border-ink-100 shadow-soft p-5">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-ink-900">微信绑定</h2>
          {!bind?.wechatEnabled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">演示模式</span>
          )}
        </div>
        <p className="text-sm text-ink-500 mb-4">
          扫码完成微信身份与本站账号的对齐。绑定后才能在微信里收到提醒 —— 光扫一个网站链接是拿不到推送权限的。
        </p>

        {bind?.bound ? (
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-primary-50 border border-primary-200">
            <div>
              <p className="font-medium text-primary-800">已绑定</p>
              <p className="text-sm text-primary-600 mt-0.5">openid {bind.openidMasked}</p>
            </div>
            <button onClick={unbind} disabled={pending} className="btn-secondary btn-sm text-sm px-4">
              解除绑定
            </button>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-[220px] h-[220px] rounded-2xl border border-ink-200 p-3 bg-white"
              dangerouslySetInnerHTML={{ __html: qr.qrSvg }}
            />
            <p className="text-xs text-ink-400">二维码 10 分钟内有效，绑定成功后本页自动更新</p>
            {!bind?.wechatEnabled && (
              <a
                href={`/api/v1/wechat/callback?demo=1&scene=${qr.scene}`}
                className="btn-secondary btn-sm text-sm px-4"
              >
                模拟扫码完成绑定
              </a>
            )}
            <button onClick={newQr} disabled={pending} className="text-sm text-ink-500 hover:text-ink-700">
              刷新二维码
            </button>
          </div>
        ) : (
          <button onClick={newQr} disabled={pending} className="btn-primary">
            生成绑定二维码
          </button>
        )}
      </section>
    </div>
  );
}
