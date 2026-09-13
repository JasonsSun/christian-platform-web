'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { apiPost } from '@/lib/api';

interface OnboardingView {
  steps: { key: string; title: string; desc: string; href: string; done: boolean }[];
  doneCount: number;
  total: number;
  dismissed: boolean;
  allDone: boolean;
}

/**
 * 新手引导卡：登录后展示 4 个起步任务，完成即打勾。
 * 完成状态由服务端按真实数据判定（不是本地缓存），换设备也不会错乱。
 */
export default function OnboardingCard() {
  const { user } = useAuth();
  const { data, reload } = useApi<OnboardingView>('/me/onboarding', [user?.id]);
  const [closed, setClosed] = useState(false);

  if (!user || closed || !data) return null;
  if (data.dismissed || data.allDone) return null;

  async function dismiss() {
    setClosed(true);
    try { await apiPost('/me/onboarding', { action: 'dismiss' }); } catch { /* 忽略：本地已关闭 */ }
  }

  const pct = data.total ? Math.round((data.doneCount / data.total) * 100) : 0;

  return (
    <section className="relative pt-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-primary-100 bg-white shadow-soft p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-display font-bold text-ink-900 text-lg">新朋友，从这里开始</h3>
              <p className="text-sm text-ink-500 mt-1">完成 {data.total} 个起步任务，快速融入社区（{data.doneCount}/{data.total}）</p>
            </div>
            <button onClick={dismiss} className="text-xs text-ink-400 hover:text-ink-600 whitespace-nowrap">不再显示 ✕</button>
          </div>

          <div className="mt-4 h-2 rounded-full bg-ink-100 overflow-hidden">
            <div className="h-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.steps.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                onClick={() => { if (s.done) reload(); }}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  s.done ? 'border-emerald-200 bg-emerald-50/60' : 'border-ink-100 hover:border-primary-200 hover:bg-primary-50/40'
                }`}
              >
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  s.done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-400'
                }`}>
                  {s.done ? '✓' : ''}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${s.done ? 'text-emerald-700' : 'text-ink-900'}`}>{s.title}</span>
                  <span className="block text-xs text-ink-500 mt-0.5">{s.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
