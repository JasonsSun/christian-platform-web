'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { NOTIF_TYPE_ICON, categoryOfNotif } from '@/lib/notificationMeta';
import type { NotificationItem } from '@/lib/types';

type TabKey = 'all' | 'activity' | 'community' | 'system';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '🔔' },
  { key: 'activity', label: '活动', icon: '📅' },
  { key: 'community', label: '社区', icon: '💬' },
  { key: 'system', label: '系统', icon: '⚙️' },
];

const iconFor = (type: string): string => NOTIF_TYPE_ICON[type] || '🔔';

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const path = user ? `/notifications${qs({ pageSize: 50 })}` : null;
  const { data, loading, error, reload } = useApi<{ items: NotificationItem[]; total: number; unread: number }>(path, [user?.id]);
  const { run, pending } = useAction();

  const items = data?.items || [];

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (onlyUnread && n.read) return false;
      if (tab !== 'all' && categoryOfNotif(n.type) !== tab) return false;
      return true;
    });
  }, [items, tab, onlyUnread]);

  const unreadCount = data?.unread ?? 0;

  async function markAll() {
    const res = await run(() => apiPost<{ ok: boolean }>('/notifications/read', {}));
    if (res) {
      reload();
      window.dispatchEvent(new Event('notif:read'));
    }
  }

  async function markOne(id: string) {
    await apiPost('/notifications/read', { ids: [id] });
    reload();
    window.dispatchEvent(new Event('notif:read'));
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后可查看你的通知</p>
        <button onClick={() => router.push('/login')} className="btn-primary">去登录</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">通知中心</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings/notifications')}
            className="btn-secondary btn-sm text-sm px-4"
          >
            提醒设置
          </button>
          <button
            onClick={markAll}
            disabled={pending || unreadCount === 0}
            className="btn-secondary btn-sm text-sm px-4 disabled:opacity-50"
          >
            {pending ? '处理中…' : '全部已读'}
          </button>
        </div>
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-1 mb-5 bg-ink-100/60 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-0 whitespace-nowrap px-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <span className="mr-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* 仅未读开关 */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setOnlyUnread(!onlyUnread)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            onlyUnread ? 'bg-primary-100 text-primary-700' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center ${onlyUnread ? 'bg-primary-500 border-primary-500' : 'border-ink-300'}`}>
            {onlyUnread && (
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            )}
          </span>
          仅未读
        </button>
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
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">🔔</div>
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">还没有通知</h2>
          <p className="text-ink-500">有新的动态会在这里提醒你</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-ink-100 shadow-soft">
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">📭</div>
          <p className="text-ink-500">该分类下暂无通知</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read) markOne(n.id);
                if (n.link) router.push(n.link);
              }}
              className={`w-full text-left flex gap-3 p-4 rounded-2xl border transition-all card-hover ${
                n.read ? 'bg-white border-ink-100' : 'bg-primary-50/60 border-primary-200'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${n.read ? 'bg-ink-100' : 'bg-primary-100'}`}>
                {iconFor(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className={`font-semibold truncate ${n.read ? 'text-ink-700' : 'text-ink-900'}`}>{n.title}</h2>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
                </div>
                <p className="text-sm text-ink-500 mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-ink-400 mt-1.5">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
