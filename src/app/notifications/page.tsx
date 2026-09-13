'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';

type TabKey = 'all' | 'activity' | 'community' | 'system';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '🔔' },
  { key: 'activity', label: '活动', icon: '📅' },
  { key: 'community', label: '社区', icon: '💬' },
  { key: 'system', label: '系统', icon: '⚙️' },
];

function categoryOf(type: string): TabKey {
  if (type.startsWith('activity_')) return 'activity';
  if ([
    'content_approved', 'content_rejected', 'content_removed', 'new_comment', 'new_like',
    'new_follow', 'friend_request', 'group_joined', 'group_post', 'prayer_amen', 'new_message',
  ].includes(type)) return 'community';
  if ([
    'live_approved', 'live_rejected', 'song_approved', 'song_rejected', 'song_submitted',
    'song_pending', 'org_review', 'quota_changed', 'quota_levelup_tip', 'password_reset',
    'live_pending',
  ].includes(type)) return 'system';
  return 'system';
}

function iconFor(type: string): string {
  switch (type) {
    case 'content_approved': return '✅';
    case 'content_rejected': return '⚠️';
    case 'content_removed': return '🗑️';
    case 'new_comment': return '💬';
    case 'new_like': return '❤️';
    case 'activity_registered': return '📅';
    case 'activity_checkin': return '📍';
    case 'new_follow': return '👤';
    case 'friend_request': return '🤝';
    case 'group_joined': return '👥';
    case 'group_post': return '📝';
    case 'new_message': return '✉️';
    case 'welcome': return '🎉';
    case 'prayer_amen': return '🙏';
    case 'live_approved': return '📺';
    case 'live_rejected': return '🚫';
    case 'live_reminder': return '📺';
    case 'live_pending': return '⏳';
    case 'song_approved': return '🎶';
    case 'song_rejected': return '🚫';
    case 'song_submitted': return '🎵';
    case 'song_pending': return '🎵';
    case 'org_review': return '⛪';
    case 'quota_changed': return '📊';
    case 'quota_levelup_tip': return '🚀';
    case 'password_reset': return '🔐';
    default: return '🔔';
  }
}

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
      if (tab !== 'all' && categoryOf(n.type) !== tab) return false;
      return true;
    });
  }, [items, tab, onlyUnread]);

  const unreadCount = data?.unread ?? 0;

  async function markAll() {
    const res = await run(() => apiPost<{ ok: boolean }>('/notifications/read', {}));
    if (res) reload();
  }

  async function markOne(id: string) {
    await apiPost('/notifications/read', { ids: [id] });
    reload();
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
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/settings/notifications')}
            className="btn-secondary text-sm py-2 px-4"
          >
            提醒设置
          </button>
          <button
            onClick={markAll}
            disabled={pending || unreadCount === 0}
            className="btn-secondary text-sm py-2 px-4 disabled:opacity-50"
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
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            <span className="mr-1">{t.icon}</span>
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
          <h3 className="font-display text-lg font-bold text-ink-900 mb-1">还没有通知</h3>
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
                  <h3 className={`font-semibold truncate ${n.read ? 'text-ink-700' : 'text-ink-900'}`}>{n.title}</h3>
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
