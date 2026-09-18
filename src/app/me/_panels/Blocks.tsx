'use client';

import Link from 'next/link';
import { apiDelete } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';

import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

export function MyBlocks() {
  const { data, loading, error, reload } = useApi<{ items: { id: string; displayName: string; username: string; avatarColor: string; city: string; church: string }[] }>('/me/blocks', []);
  const { run } = useAction();
  const notice = useNotice();

  async function unblock(id: string) {
    const res = await run(() => apiDelete<{ blocked: boolean }>(`/users/${id}/block`));
    if (res) {
      reload();
      notice.success('已解除屏蔽');
    }
  }

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  const items = data?.items || [];
  if (items.length === 0) return <EmptyBlock text="你还没有屏蔽任何人" action={{ label: '发现弟兄姐妹', href: '/friends' }} />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">屏蔽后，对方将不会出现在你的关注动态与私信会话中。</p>
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
          <button onClick={() => unblock(u.id)} className="text-sm text-rose-500 hover:underline flex-shrink-0">解除屏蔽</button>
        </div>
      ))}
    </div>
  );
}
