'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { apiDelete, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useConfirmNav } from '@/lib/confirm';
import { useNotice } from '@/lib/notice';
import { timeAgo } from '@/lib/format';
import type { Author, PrayerItem, ListResult } from '@/lib/types';

const TABS = [
  { key: 'all', label: '全部代祷' },
  { key: 'unanswered', label: '待祷中' },
  { key: 'answered', label: '已蒙应允' },
  { key: 'mine', label: '我的代祷' },
];

const PAGE_SIZE = 20;

function Avatar({ user, size = 40 }: { user: Author; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{
        backgroundColor: user.avatarColor || '#3d52d9',
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {(user.displayName || user.username || '?').slice(0, 1)}
    </span>
  );
}

export default function PrayersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const confirmNav = useConfirmNav();
  const notice = useNotice();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [body, setBody] = useState('');

  const postAction = useAction();
  const amenAction = useAction();

  // 「我的」需要登录态;未登录时 scope 传 mine 会被后端忽略,这里直接切回全部
  const scope = tab === 'mine' && !user ? 'all' : tab;

  const { data, loading, setData } = useApi<ListResult<PrayerItem>>(
    '/prayers' + qs({ scope, pageSize: page * PAGE_SIZE }),
    [scope, page, user?.id]
  );

  const items = data?.items || [];
  const total = data?.total || 0;
  const hasMore = items.length < total;

  const submit = useCallback(async () => {
    const text = body.trim();
    if (!user) { router.push('/login?next=/prayers'); return; }
    if (text.length < 5) { postAction.setError('代祷内容至少 5 个字'); return; }
    const res = await postAction.run(() => apiPost<PrayerItem>('/prayers', { body: text }));
    if (res) {
      setBody('');
      setData((prev) => (prev ? { ...prev, items: [res, ...prev.items], total: prev.total + 1 } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, user, router]);

  const toggleAmen = useCallback(async (p: PrayerItem) => {
    if (!user) { router.push('/login?next=/prayers'); return; }
    const res = await amenAction.run(() =>
      apiPost<{ amened: boolean; amenCount: number }>(`/prayers/${p.id}/amen`)
    );
    if (res) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((x) =>
                x.id === p.id ? { ...x, amened: res.amened, amenCount: res.amenCount } : x
              ),
            }
          : prev
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router]);

  /**
   * 能否删除这条代祷：作者本人，或管理员。
   * 仅管理员可删任何一条（清理违规违法内容）；审核员只有审核权限，不赋予删除权。
   */
  const canDelete = useCallback(
    (p: PrayerItem) => {
      if (!user) return false;
      return p.user.id === user.id || user.role === 'admin';
    },
    [user]
  );

  /**
   * 删除代祷：本站禁止弹框，走「跳转式确认页 /confirm」，
   * 确认后执行删除并回跳本页（本页重新挂载会自动刷新列表）。
   */
  const removePrayer = useCallback(
    (p: PrayerItem) => {
      const mine = p.user.id === user?.id;
      confirmNav({
        title: mine ? '删除代祷' : '移除违规代祷',
        desc: mine
          ? '确定删除这条代祷吗？删除后不可恢复。'
          : `确定移除「${p.user.displayName}」的这条代祷吗？该操作会记入审计日志，删除后不可恢复。`,
        confirmText: mine ? '删除' : '移除',
        danger: true,
        action: 'prayer.delete',
        params: { prayerId: p.id, byStaff: !mine },
        onConfirm: async () => {
          const res = await apiDelete<{ ok: boolean }>(`/prayers/${p.id}`);
          if (res?.ok) {
            setData((prev) =>
              prev
                ? { ...prev, items: prev.items.filter((x) => x.id !== p.id), total: Math.max(0, prev.total - 1) }
                : prev
            );
            notice.success(mine ? '代祷已删除' : '该代祷已被移除');
          }
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, confirmNav, notice]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 页头 */}
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900">代祷墙</h1>
        <p className="text-ink-500 mt-1 text-sm">
          为主内肢体守望，一句「阿们」就是一同站立
        </p>
      </div>

      {/* 发布框 */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100 mb-6">
        <div className="flex gap-2">
          <input
            name="body"
            aria-label="代祷事项"
            aria-describedby={postAction.error ? 'prayer-post-error' : undefined}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={1000}
            placeholder={user ? '写下你的代祷事项…' : '登录后发布代祷'}
            className="input-styled py-2.5 text-sm"
          />
          <button
            onClick={submit}
            disabled={postAction.pending}
            className="btn-primary px-5 py-2.5 text-sm flex-shrink-0"
          >
            {postAction.pending ? '发布中…' : '发布'}
          </button>
        </div>
        {postAction.error && <p id="prayer-post-error" role="alert" className="text-rose-600 text-xs mt-2">{postAction.error}</p>}
        <p className="text-xs text-ink-400 mt-2">代祷内容公开可见，请勿填写敏感个人信息。</p>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="代祷筛选">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            disabled={t.key === 'mine' && !user}
            aria-pressed={tab === t.key}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              tab === t.key
                ? 'bg-primary-600 text-white'
                : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-400">{total} 条代祷</span>
      </div>

      {/* 列表 */}
      {loading && items.length === 0 && (
        <div className="text-center py-16 text-ink-400 text-sm">加载中…</div>
      )}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-ink-400 text-sm">
          这里还没有代祷，成为第一个吧～
        </div>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <article
            key={p.id}
            className="bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100"
          >
            <div className="flex items-start gap-3">
              <Avatar user={p.user} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900 text-sm">{p.user.displayName}</span>
                  <span className="text-xs text-ink-400">{timeAgo(p.createdAt)}</span>
                  {p.answered && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      已蒙应允
                    </span>
                  )}
                </div>
                <p className="text-ink-700 text-sm mt-1.5 leading-relaxed whitespace-pre-wrap">
                  {p.body}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleAmen(p)}
                    disabled={amenAction.pending}
                    className={`flex items-center gap-1.5 text-sm transition-colors disabled:opacity-60 ${
                      p.amened ? 'text-gold-600' : 'text-ink-500 hover:text-gold-600'
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill={p.amened ? 'currentColor' : 'none'}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 21C12 21 4 14.5 4 9a4 4 0 018-1 4 4 0 018 1c0 5.5-8 12-8 12z"
                      />
                    </svg>
                    阿们 ({p.amenCount})
                  </button>

                  {/* 作者可删自己的；管理员/审核员可删任何一条（清理违规违法内容） */}
                  {canDelete(p) && (
                    <button
                      onClick={() => removePrayer(p)}
                      title={
                        p.user.id === user?.id
                          ? '删除这条代祷'
                          : '管理员/审核员：移除违规代祷'
                      }
                      className={`ml-auto flex items-center gap-1 text-xs transition-colors ${
                        p.user.id === user?.id
                          ? 'text-ink-400 hover:text-rose-600'
                          : 'text-rose-600 hover:text-rose-700 font-medium'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      {p.user.id === user?.id ? '删除' : '移除'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => setPage((n) => n + 1)}
            disabled={loading}
            className="btn-ghost btn-sm px-6 text-sm"
          >
            {loading ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  );
}
