'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPatch } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';

type DmPolicy = 'everyone' | 'followers' | 'none';

type MePayload = {
  id: string;
  displayName?: string;
  allowDm?: DmPolicy;
};

const OPTIONS: { key: DmPolicy; label: string; desc: string; icon: string }[] = [
  { key: 'everyone', label: '所有人', desc: '任何已登录用户都可以给你发私信', icon: '🌐' },
  { key: 'followers', label: '仅我的粉丝', desc: '只有关注了你的人才能发私信，陌生人需先关注', icon: '👥' },
  { key: 'none', label: '不接受私信', desc: '关闭私信入口，任何人都无法主动给你发消息', icon: '🔕' },
];

export default function PrivacySettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, loading, reload } = useApi<MePayload>(user ? '/auth/me' : null, [user?.id]);
  const { run, pending } = useAction();
  const [current, setCurrent] = useState<DmPolicy | null>(null);
  const [toast, setToast] = useState<string>('');

  useEffect(() => {
    if (data?.allowDm) setCurrent(data.allowDm);
  }, [data?.allowDm]);

  async function choose(policy: DmPolicy) {
    if (policy === current) return;
    setCurrent(policy);
    setToast('');
    const res = await run(() => apiPatch<MePayload>('/auth/me', { allowDm: policy }));
    if (res) {
      setToast('已保存');
      reload();
    } else {
      // 失败回滚到服务端值
      if (data?.allowDm) setCurrent(data.allowDm);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后管理你的隐私设置</p>
        <button onClick={() => router.push('/login')} className="btn-primary">去登录</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">隐私设置</h1>
      <p className="text-ink-500 text-sm mb-6">控制谁可以给你发送私信。被你屏蔽的用户始终无法联系你。</p>

      {toast && (
        <div className="mb-5 px-4 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 text-sm">
          {toast}
        </div>
      )}

      {loading && !current && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-ink-100" />
          ))}
        </div>
      )}

      <section className="space-y-3">
        {OPTIONS.map((o) => {
          const on = current === o.key;
          return (
            <button
              key={o.key}
              disabled={pending}
              onClick={() => choose(o.key)}
              className={`w-full text-left bg-white rounded-2xl border p-4 flex items-center gap-4 transition-all disabled:opacity-60 ${
                on ? 'border-primary-300 ring-2 ring-primary-100' : 'border-ink-100 hover:border-ink-200'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-ink-100 flex items-center justify-center text-xl flex-shrink-0">{o.icon}</div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink-900">{o.label}</h2>
                <p className="text-sm text-ink-500 mt-0.5">{o.desc}</p>
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  on ? 'border-primary-500 bg-primary-500' : 'border-ink-300'
                }`}
              >
                {on && <span className="block w-2 h-2 rounded-full bg-white" />}
              </span>
            </button>
          );
        })}
      </section>

      <section className="mt-6 bg-white rounded-2xl border border-ink-100 shadow-soft p-5">
        <h2 className="font-semibold text-ink-900 mb-1">屏蔽管理</h2>
        <p className="text-sm text-ink-500 mb-4">
          在任意用户主页点击「屏蔽」即可将其加入黑名单。被屏蔽者无法给你发私信，也不会出现在你的关注流与公开推荐中。
        </p>
        <Link href="/settings/blocked" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          查看我的屏蔽列表 →
        </Link>
      </section>
    </div>
  );
}
