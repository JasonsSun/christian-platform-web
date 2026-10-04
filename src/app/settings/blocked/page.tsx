'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiDelete } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { LoginGate } from '@/components/LoginGate';

type BlockedUser = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  city: string;
  church: string;
  createdAt: string;
};

export default function BlockedUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ items: BlockedUser[] }>(user ? '/me/blocks' : null, [user?.id]);
  const { run } = useAction();
  const [toast, setToast] = useState<string>('');

  async function unblock(id: string) {
    const res = await run(() => apiDelete<{ blocked: boolean }>(`/users/${id}/block`));
    if (res) {
      setToast('已解除屏蔽');
      reload();
    }
  }

  if (!user) {
    return <LoginGate hint="登录后管理你的屏蔽列表" next="/settings/blocked" />;
  }

  const items = data?.items || [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">屏蔽列表</h1>
      <p className="text-ink-500 text-sm mb-6">被你屏蔽的用户无法给你发私信，也不会出现在你的关注动态与公开推荐中。</p>

      {toast && (
        <div className="mb-5 px-4 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 text-sm">
          {toast}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-16 animate-pulse border border-ink-100" />
          ))}
        </div>
      )}

      {error && items.length === 0 && (
        <div className="text-center text-rose-600 py-10">
          <p>{error}</p>
          <button onClick={reload} className="btn-secondary mt-3">重试</button>
        </div>
      )}

      {/* 解除屏蔽会 reload()，旧列表还在：整块门在 !loading 上就是
          「点一下取消，整张名单换成骨架再弹回来」 */}
      {error && items.length > 0 && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error} <button onClick={reload} className="underline ml-1">重试</button>
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-10">
          <p className="text-ink-400 mb-4">你还没有屏蔽任何人</p>
          <Link href="/friends" className="btn-primary">发现弟兄姐妹</Link>
        </div>
      )}

      {items.length > 0 && (
        <div className={`space-y-3 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
          {items.map((u) => (
            <div key={u.id} className="bg-white rounded-2xl p-4 border border-ink-100 flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                style={{ background: u.avatarColor }}
              >
                {(u.displayName || u.username || '?').slice(0, 1)}
              </span>
              <div className="flex-1 min-w-0">
                <Link href={`/users/${u.id}`} className="font-semibold text-ink-900 hover:text-primary-600 transition-colors">{u.displayName}</Link>
                <p className="text-xs text-ink-400">@{u.username}{u.city ? ` · ${u.city}` : ''}</p>
              </div>
              <button onClick={() => unblock(u.id)} className="text-sm text-rose-600 hover:underline flex-shrink-0">解除屏蔽</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
