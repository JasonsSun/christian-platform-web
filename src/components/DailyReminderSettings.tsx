'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

export type ReminderPatch = {
  remindEnabled?: boolean;
  remindReadAt?: string;
  remindDevotionAt?: string;
};

type PushState = { configured: boolean; publicKey: string; subscriptions: number };

/** 收到的 applicationServerKey 是 base64url,得转成 Uint8Array 才能喂给 pushManager */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export default function DailyReminderSettings({
  prefs,
  onChange,
}: {
  prefs: ReminderPatch | null;
  onChange: (patch: ReminderPatch) => void;
}) {
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const reloadPush = useCallback(async () => {
    try {
      setPush(await apiGet<PushState>('/me/push'));
    } catch {
      setPush(null);
    }
  }, []);

  useEffect(() => {
    reloadPush();
  }, [reloadPush]);

  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const subscribe = useCallback(async () => {
    setBusy(true);
    setNote('');
    try {
      if (!push?.configured) {
        setNote('服务端尚未配置推送密钥，请联系管理员开启');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNote('浏览器通知权限被拒绝');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(push.publicKey),
      });
      const json = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
      await apiPost('/me/push', { subscription: json });
      await reloadPush();
      setNote('已开启浏览器推送');
    } catch (e: any) {
      setNote(e?.message || '订阅失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }, [push, reloadPush]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    setNote('');
    try {
      await apiDelete('/me/push');
      await reloadPush();
      setNote('已关闭浏览器推送');
    } catch (e: any) {
      setNote(e?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }, [reloadPush]);

  const on = !!prefs?.remindEnabled;
  const subscribed = Number(push?.subscriptions || 0) > 0;

  return (
    <section className="mt-6 bg-white rounded-2xl border border-ink-100 shadow-soft p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink-900">每日提醒</h3>
          <p className="text-sm text-ink-500 mt-0.5">
            到点会收到一条站内通知，并按你在上方开启的通道同步往外发
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => onChange({ remindEnabled: !on })}
          className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-primary-500' : 'bg-ink-200'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform mx-1 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {on && (
        <div className="mt-4 pt-4 border-t border-ink-100 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-700 w-28">读经提醒</span>
            <input
              type="time"
              value={prefs?.remindReadAt || '06:30'}
              onChange={(e) => onChange({ remindReadAt: e.target.value })}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
            />
            <span className="text-xs text-ink-400">按北京时间</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-700 w-28">灵修提醒</span>
            <input
              type="time"
              value={prefs?.remindDevotionAt || '21:30'}
              onChange={(e) => onChange({ remindDevotionAt: e.target.value })}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
            />
            <span className="text-xs text-ink-400">按北京时间</span>
          </div>

          {supported && push?.configured && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-sm text-ink-700 w-28">浏览器推送</span>
              {subscribed ? (
                <button onClick={unsubscribe} disabled={busy} className="btn-secondary text-sm py-2 px-4">
                  关闭推送
                </button>
              ) : (
                <button onClick={subscribe} disabled={busy} className="btn-secondary text-sm py-2 px-4">
                  开启推送
                </button>
              )}
              <span className="text-xs text-ink-400">
                国内网络常连不上推送服务，收不到属正常，站内通知始终可靠
              </span>
            </div>
          )}

          {note && <p className="text-xs text-primary-700">{note}</p>}
        </div>
      )}
    </section>
  );
}
