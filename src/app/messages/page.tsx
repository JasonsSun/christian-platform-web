'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { IconMail, IconSearch } from '@/components/icons';
import type { Conversation } from '@/lib/types';

function Avatar({ name, color, size = 48, userId }: { name: string; color: string; size?: number; userId?: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      data-user-id={userId}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [keyword, setKeyword] = useState('');

  const { data, loading, error, reload } = useApi<{ items: Conversation[] }>(user ? '/messages' : null, [user?.id]);
  const items = data?.items || [];

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return items;
    return items.filter((c) =>
      c.peer.displayName.toLowerCase().includes(k) ||
      c.peer.username?.toLowerCase().includes(k) ||
      (c.lastMessage || '').toLowerCase().includes(k)
    );
  }, [items, keyword]);

  const unreadTotal = items.reduce((s, c) => s + (c.unread || 0), 0);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后可查看你的私信</p>
        <button onClick={() => router.push('/login?next=/messages')} className="btn-primary">去登录</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">我的消息</h1>
          {unreadTotal > 0 && (
            <p className="text-sm text-ink-500 mt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {unreadTotal} 条未读消息
              </span>
            </p>
          )}
        </div>
        <Link href="/friends" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
          发现用户
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </Link>
      </div>

      {/* 搜索框 */}
      <div className="relative mb-5">
        <svg className="w-5 h-5 text-ink-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          aria-label="搜索联系人或消息"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索联系人或消息..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-ink-200 bg-white/70 backdrop-blur-sm text-ink-900 placeholder:text-ink-400 transition-all duration-300 focus:outline-none focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-100 hover:border-primary-300"
        />
        {keyword && (
          <button
            onClick={() => setKeyword('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1"
            aria-label="清除"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-ink-100" />))}
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-rose-600 mb-3">{error}</p>
          <button onClick={reload} className="btn-secondary">重试</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-ink-100 shadow-soft">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-3">
            <IconMail className="w-7 h-7" strokeWidth={1.6} />
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">还没有会话</h2>
          <p className="text-ink-500 mb-5">去发现弟兄姊妹，发起你的第一次聊天吧</p>
          <Link href="/friends" className="btn-primary">发现用户</Link>
        </div>
      )}

      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-ink-100 shadow-soft">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-3">
            <IconSearch className="w-7 h-7" strokeWidth={1.6} />
          </div>
          <p className="text-ink-500">没有找到匹配「{keyword}」的会话</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link
              key={c.peer.id}
              href={`/messages/${c.peer.id}`}
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all card-hover ${
                c.unread > 0 ? 'bg-primary-50/60 border-primary-100' : 'bg-white border-ink-100'
              }`}
            >
              <div className="relative">
                <Avatar name={c.peer.displayName} color={c.peer.avatarColor} size={48} userId={c.peer.id} />
                {/* 在线状态指示：当前无在线数据，统一显示离线 */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-ink-300"
                  title="离线"
                />
                {c.unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">
                    {c.unread > 99 ? '99+' : c.unread}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={`font-semibold truncate ${c.unread > 0 ? 'text-ink-900' : 'text-ink-700'}`}>
                    {c.peer.displayName}
                  </h2>
                  <span className="text-xs text-ink-400 flex-shrink-0">{timeAgo(c.lastAt)}</span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${c.unread > 0 ? 'text-ink-600' : 'text-ink-400'}`}>
                  {c.lastMessage || '暂无消息'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
