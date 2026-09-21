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
import { Skeleton } from '@/components/Skeleton';
import { IconPray, IconTrash } from '@/components/icons';

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

  const { data, loading, error, reload, setData } = useApi<ListResult<PrayerItem>>(
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
        <div className="eyebrow mb-2">PRAYER WALL</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900">代祷墙</h1>
        <p className="text-ink-500 mt-1 text-sm">
          为主内肢体守望，一句「阿们」就是一同站立
        </p>
      </div>

      {/* 发布框 */}
      <div data-spot className="spot glow-edge bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100 mb-6">
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
            className="btn-primary px-5 py-2.5 text-sm flex-shrink-0 min-h-[44px]"
          >
            {postAction.pending ? '发布中…' : '发布'}
          </button>
        </div>
        {postAction.error && <p id="prayer-post-error" role="alert" className="text-rose-600 text-xs mt-2">{postAction.error}</p>}
        <p className="text-xs text-ink-400 mt-2">代祷内容公开可见，请勿填写敏感个人信息。</p>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-5" role="group" aria-label="代祷筛选">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            disabled={t.key === 'mine' && !user}
            aria-pressed={tab === t.key}
            className={`inline-flex items-center px-4 py-2 min-h-[44px] rounded-full text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              tab === t.key
                ? 'bg-primary-600 text-white'
                : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-400"><span className="num font-semibold text-ink-600">{total}</span> 条代祷</span>
      </div>

      {/* 列表 */}
      {loading && items.length === 0 && (
        <div className="space-y-3">
          <p className="sr-only">加载中…</p>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28 skeleton-sheen" />
                  <Skeleton className="h-3 w-full skeleton-sheen" />
                  <Skeleton className="h-3 w-2/3 skeleton-sheen" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 原先整页没取 error：请求失败时 items 是空的，于是「这里还没有代祷」
          把一次失败说成了空名单。失败要有失败的样子。 */}
      {error && items.length === 0 && (
        <div role="alert" className="bg-white rounded-3xl border border-rose-200 px-6 py-16 text-center">
          <p className="text-rose-600 text-sm mb-4">{error}</p>
          <button onClick={reload} className="btn-secondary">重试</button>
        </div>
      )}
      {error && items.length > 0 && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error} <button onClick={reload} className="underline ml-1">重试</button>
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-3xl border border-dashed border-ink-200 px-6 py-16 text-center">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-ink-50 text-ink-400 items-center justify-center mb-3">
            <IconPray className="w-6 h-6" strokeWidth={1.6} />
          </span>
          <p className="text-ink-400 text-sm">这里还没有代祷，成为第一个吧～</p>
        </div>
      )}

      <div data-reveal-group className={`space-y-3 transition-opacity duration-200 ${loading && items.length ? 'opacity-60' : 'opacity-100'}`}>
        {items.map((p) => (
          <article
            key={p.id}
            data-spot
            className="spot bg-white rounded-2xl p-4 sm:p-5 shadow-soft border border-ink-100"
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
                    aria-pressed={p.amened}
                    className={`flex items-center gap-1.5 text-sm py-1.5 -my-1.5 transition-colors disabled:opacity-60 ${
                      p.amened ? 'text-gold-600' : 'text-ink-500 hover:text-gold-600'
                    }`}
                  >
                    <IconPray className="w-4 h-4" strokeWidth={1.6} />
                    阿们 (<span className="num">{p.amenCount}</span>)
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
                      className={`ml-auto flex items-center gap-1 text-xs py-1.5 -my-1.5 transition-colors ${
                        p.user.id === user?.id
                          ? 'text-ink-400 hover:text-rose-600'
                          : 'text-rose-600 hover:text-rose-700 font-medium'
                      }`}
                    >
                      <IconTrash className="w-3.5 h-3.5" strokeWidth={1.6} />
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
