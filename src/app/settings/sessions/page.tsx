'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginGate } from '@/components/LoginGate';
import { apiGet, apiDelete } from '@/lib/api';
import { timeAgo } from '@/lib/format';

type SessionItem = {
  id: string;
  current: boolean;
  device: string;
  browser: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
};

export default function SessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ items: SessionItem[] }>('/me/sessions');
      setItems(r.items || []);
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || '加载失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading, load]);

  async function revokeOne(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      await apiDelete<{ revoked: number }>(`/me/sessions?id=${encodeURIComponent(id)}`);
      setItems((it) => it.filter((x) => x.id !== id));
      setMsg({ type: 'ok', text: '该设备已登出' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || '操作失败' });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setRevokingAll(true);
    setMsg(null);
    try {
      const r = await apiDelete<{ revoked: number }>('/me/sessions');
      setItems((it) => it.filter((x) => x.current));
      setMsg({ type: 'ok', text: `已登出其它 ${r.revoked || 0} 台设备` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || '操作失败' });
    } finally {
      setRevokingAll(false);
    }
  }

  if (authLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (!user) {
    return <LoginGate hint="登录后即可查看和管理你的登录设备" next="/settings/sessions" />;
  }

  const others = items.filter((x) => !x.current);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">登录设备</h1>
          <p className="text-sm text-ink-500 mt-1">
            这里是你账号当前所有登录中的设备。发现陌生设备请立即登出并修改密码。
          </p>
        </div>
        <Link href="/me" className="inline-flex items-center py-3 -my-3 text-sm text-primary-700 hover:underline shrink-0">
          返回个人中心
        </Link>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
            msg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-ink-500">共 {items.length} 台设备</span>
        {others.length > 0 && (
          <button
            onClick={revokeOthers}
            disabled={revokingAll}
            className="text-sm px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
          >
            {revokingAll ? '处理中…' : `登出其它 ${others.length} 台`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-ink-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-ink-400 rounded-2xl border border-ink-100 bg-white">
          没有登录中的设备
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-4 rounded-2xl bg-white border border-ink-100 p-4"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink-900">{s.device}</span>
                  <span className="text-xs text-ink-500">{s.browser}</span>
                  {s.current && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      当前设备
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-400 mt-0.5 truncate">
                  {s.ip ? `IP ${s.ip} · ` : ''}
                  {s.lastSeenAt ? `活跃于 ${timeAgo(s.lastSeenAt)}` : `登录于 ${timeAgo(s.createdAt)}`}
                </div>
              </div>

              {!s.current && (
                <button
                  onClick={() => revokeOne(s.id)}
                  disabled={busyId === s.id}
                  className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-ink-200 text-ink-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
                >
                  {busyId === s.id ? '处理中…' : '登出'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-ink-400 leading-relaxed">
        修改密码或重置密码后，所有设备都会被自动登出。刷新令牌是一次性的：若检测到重放使用，
        系统会撤销全部会话作为保护。
      </p>
    </div>
  );
}
