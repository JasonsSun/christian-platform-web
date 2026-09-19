'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect } from 'react';
import { apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { timeAgo } from '@/lib/format';
import type { Author, ContentItem, PrayerItem, GroupItem, ListResult } from '@/lib/types';
import { ContentCardSkeleton, Skeleton } from '@/components/Skeleton';
import RichText from '@/components/RichText';
import GovernanceTeam from '@/components/GovernanceTeam';

function Avatar({ user, size = 36 }: { user: Author; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{ backgroundColor: user.avatarColor || '#3d52d9', width: size, height: size, fontSize: size * 0.4 }}
    >
      {(user.displayName || user.username || '?').slice(0, 1)}
    </span>
  );
}

const TYPE_TABS = [
  { id: 'all', label: '全部', icon: '🌐' },
  { id: 'testimony', label: '见证', icon: '✨' },
  { id: 'prayer', label: '代祷', icon: '🙏' },
  { id: 'article', label: '分享', icon: '📝' },
];

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  testimony: { label: '见证', cls: 'bg-gold-50 text-gold-700 border-gold-200' },
  prayer: { label: '代祷', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  article: { label: '分享', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  devotion: { label: '灵修', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  media: { label: '媒体', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export default function CommunityPage() {
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();

  const [type, setType] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'hot'>('new');

  // 支持 /community?q=话题 直达（#话题 链接的落点）。
  // 用 window.location 而非 useSearchParams，避免触发 Suspense 边界要求。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const kw = new URLSearchParams(window.location.search).get('q');
    if (kw) setQ(kw);
  }, []);

  const contentsPath =
    '/contents' +
    qs({
      type: type === 'all' ? undefined : type,
      q: q || undefined,
      status: 'published',
      sort,
      page: 1,
      pageSize: 20,
    });
  const { data, loading, error, setData } = useApi<ListResult<ContentItem>>(contentsPath, [type, q, sort]);
  const items = data?.items || [];

  const { data: prayersData, loading: prayersLoading, setData: setPrayers } = useApi<ListResult<PrayerItem>>(
    '/prayers' + qs({ scope: 'all' }),
    []
  );
  const prayers = prayersData?.items || [];

  const { data: groupsData } = useApi<ListResult<GroupItem>>('/groups' + qs({ scope: 'all', pageSize: 3 }), []);
  const hotGroups = (groupsData?.items || []).slice(0, 3);

  const likeAction = useAction();
  const prayerAction = useAction();
  const amenAction = useAction();

  const handleLike = useCallback(
    async (item: ContentItem) => {
      if (!user) {
        notice.info('请先登录后再点赞');
        goLogin();
        return;
      }
      const res = await likeAction.run(() => apiPost<{ liked: boolean; likeCount: number }>(`/contents/${item.id}/like`));
      if (res) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((c) => (c.id === item.id ? { ...c, liked: res.liked, likeCount: res.likeCount } : c)),
          };
        });
      }
    },
    [user, likeAction, goLogin, notice, setData]
  );

  const [prayerBody, setPrayerBody] = useState('');
  const submitPrayer = useCallback(async () => {
    if (!user) {
      notice.info('请先登录后再发布代祷');
      goLogin();
      return;
    }
    const body = prayerBody.trim();
    if (!body) return;
    const res = await prayerAction.run(() => apiPost<PrayerItem>('/prayers', { body }));
    if (res) {
      setPrayerBody('');
      setPrayers((prev) => ({ items: [res, ...(prev?.items || [])], total: (prev?.total || 0) + 1, page: 1, pageSize: prev?.pageSize || 20 }));
    }
  }, [user, prayerBody, prayerAction, goLogin, notice, setPrayers]);

  const handleAmen = useCallback(
    async (p: PrayerItem) => {
      if (!user) {
        notice.info('请先登录后再代祷');
        goLogin();
        return;
      }
      const res = await amenAction.run(() => apiPost<{ amened: boolean; amenCount: number }>(`/prayers/${p.id}/amen`));
      if (res) {
        setPrayers((prev) => {
          if (!prev) return prev;
          return { ...prev, items: prev.items.map((x) => (x.id === p.id ? { ...x, amened: res.amened, amenCount: res.amenCount } : x)) };
        });
      }
    },
    [user, amenAction, goLogin, notice, setPrayers]
  );

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-10 md:py-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-6 right-10 w-64 h-64 bg-primary-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-10 w-64 h-64 bg-gold-400/15 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">团契社区</h1>
          <p className="text-white/85 max-w-2xl mx-auto font-serif italic">
            “你们要彼此相爱，像我爱你们一样。” —— 约翰福音 15:12
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
            {/* 左侧内容流 */}
            <div className="lg:col-span-2 space-y-5 min-w-0">
              {/* 筛选栏 */}
              <div className="bg-white rounded-2xl p-4 border border-ink-100 shadow-soft space-y-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="flex flex-wrap gap-2 min-w-0">
                    {TYPE_TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setType(t.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                          type === t.id
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                            : 'bg-ink-50 text-ink-600 hover:bg-primary-50 hover:text-primary-700'
                        }`}
                      >
                        <span>{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex gap-1 bg-ink-50 rounded-xl p-1">
                    <button
                      onClick={() => setSort('new')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        sort === 'new' ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      最新
                    </button>
                    <button
                      onClick={() => setSort('hot')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        sort === 'hot' ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      最热
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <svg className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    aria-label="搜索社区内容"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="搜索文章、见证、代祷、分享…"
                    className="input-styled input-icon"
                  />
                </div>
              </div>

              {/* 发布按钮 */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-500">
                  {loading ? '加载中…' : `共 ${data?.total ?? items.length} 条内容`}
                </p>
                <Link href="/community/create" className="btn-gold text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  发布内容
                </Link>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm">{error}</div>
              )}

              {loading && (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ContentCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {!loading && !error && items.length === 0 && (
                <div className="bg-white rounded-2xl p-10 text-center text-ink-400 border border-ink-100">
                  还没有内容，去
                  <Link href="/community/create" className="text-primary-600 mx-1">
                    发布
                  </Link>
                  第一条吧～
                </div>
              )}

              <div className="space-y-4">
                {items.map((item) => {
                  const badge = TYPE_BADGE[item.contentType];
                  return (
                    <article
                      key={item.id}
                      className="card-hover bg-white rounded-2xl p-5 border border-ink-100 shadow-soft hover:shadow-card-hover group"
                    >
                      <Link href={`/contents/${item.id}`} className="flex gap-4">
                        {item.cover ? (
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-3xl flex-shrink-0">
                            {item.cover}
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ink-50 to-ink-100 flex items-center justify-center text-2xl flex-shrink-0">
                            📄
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {badge && (
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            )}
                            {item.tags?.[0] && (
                              <span className="text-xs text-ink-400">#{item.tags[0]}</span>
                            )}
                          </div>
                          <h2 className="font-display font-bold text-lg text-ink-900 truncate group-hover:text-primary-700 transition-colors">
                            {item.title}
                          </h2>
                          <p className="text-sm text-ink-500 line-clamp-2 mt-1 leading-relaxed">
                            {item.excerpt || item.body?.slice(0, 80)}
                          </p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-3 mt-4 text-sm text-ink-500">
                        <Avatar user={item.author} size={28} />
                        <span className="text-ink-700 font-medium">{item.author.displayName}</span>
                        <span className="text-ink-400">·</span>
                        <span>{timeAgo(item.publishedAt || item.createdAt)}</span>
                        <div className="ml-auto flex items-center gap-4">
                          <button
                            onClick={() => handleLike(item)}
                            aria-pressed={item.liked}
                            aria-label={`点赞，当前 ${item.likeCount} 赞`}
                            className={`flex items-center gap-1 py-1.5 -my-1.5 px-2 -mx-2 transition-all ${
                              item.liked ? 'text-rose-600 scale-105' : 'text-ink-500 hover:text-rose-600'
                            }`}
                          >
                            <svg className="w-4 h-4" fill={item.liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            {item.likeCount}
                          </button>
                          <Link
                            href={`/contents/${item.id}`}
                            aria-label={`查看 ${item.commentCount} 条评论：${item.title}`}
                            className="flex items-center gap-1 py-2 -my-2 px-2 -mx-2 text-ink-500 hover:text-primary-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h6m-6 6h8a2 2 0 002-2V8l-4-4H8a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {item.commentCount}
                          </Link>
                          <span className="flex items-center gap-1 py-2 -my-2" title="阅读数">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="sr-only">阅读</span>
                            {item.viewCount}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* 右侧栏 */}
            <div className="space-y-6">
              {/* 代祷墙 */}
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🙏</span>
                    <h2 className="font-display text-xl font-bold text-ink-900">代祷墙</h2>
                  </div>
                  <Link href="/prayers" className="inline-flex items-center text-primary-600 text-sm font-medium hover:underline">
                    更多 →
                  </Link>
                </div>

                <div className="flex gap-2 mb-4">
                  <input
                    aria-label="代祷事项内容"
                    value={prayerBody}
                    onChange={(e) => setPrayerBody(e.target.value)}
                    placeholder="写下你的代祷事项…"
                    className="input-styled input-sm text-sm min-w-0 flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && submitPrayer()}
                  />
                  <button onClick={submitPrayer} disabled={prayerAction.pending} className="btn-primary btn-sm px-4 text-sm flex-shrink-0">
                    发布
                  </button>
                </div>
                {prayerAction.error && <p className="text-rose-600 text-xs mb-2">{prayerAction.error}</p>}

                {prayersLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100">
                        <div className="flex items-start gap-3">
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!prayersLoading && prayers.length === 0 && (
                  <p className="text-center py-4 text-ink-400 text-sm">还没有代祷，成为第一个吧～</p>
                )}
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {prayers.map((p) => (
                    <div key={p.id} className="p-4 rounded-2xl bg-gradient-to-r from-rose-50/60 to-pink-50/60 border border-rose-100">
                      <div className="flex items-start gap-3">
                        <Avatar user={p.user} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink-900 text-sm">{p.user.displayName}</span>
                            <span className="text-xs text-ink-400">{timeAgo(p.createdAt)}</span>
                            {p.answered && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">已应允</span>
                            )}
                          </div>
                          <RichText text={p.body} className="block text-ink-700 text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words" />
                          <button
                            onClick={() => handleAmen(p)}
                            className={`mt-2 flex items-center gap-1.5 text-sm font-medium py-1.5 -my-1.5 transition-colors ${
                              p.amened ? 'text-gold-600' : 'text-ink-500 hover:text-gold-600'
                            }`}
                          >
                            <svg className="w-4 h-4" fill={p.amened ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21C12 21 4 14.5 4 9a4 4 0 018-1 4 4 0 018 1c0 5.5-8 12-8 12z" />
                            </svg>
                            阿们 ({p.amenCount})
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 推荐团契 */}
              <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👥</span>
                    <h2 className="font-display text-xl font-bold text-ink-900">推荐团契</h2>
                  </div>
                  <Link href="/groups" className="inline-flex items-center text-primary-600 text-sm font-medium hover:underline">
                    全部 →
                  </Link>
                </div>
                <div className="space-y-3">
                  {hotGroups.map((g) => (
                    <Link
                      key={g.id}
                      href={`/groups/${g.id}`}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-ink-100 hover:border-primary-200 hover:bg-primary-50/50 transition-all"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl flex-shrink-0">
                        {g.cover || '👥'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-ink-900 truncate">{g.name}</h2>
                        <p className="text-xs text-ink-500">{g.memberCount} 成员 · {g.city || '线上'}</p>
                      </div>
                      <svg className="w-4 h-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                  {hotGroups.length === 0 && <p className="text-center py-4 text-ink-400 text-sm">暂无团契</p>}
                </div>
              </div>

              {/* 发布 CTA */}
              <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-6 text-white relative overflow-hidden shadow-card-hover">
                <div className="absolute -top-6 -right-6 w-24 h-24 bg-gold-400/20 rounded-full blur-2xl" />
                <h2 className="font-display text-xl font-bold mb-2 relative">分享你的故事</h2>
                <p className="text-white/80 text-sm mb-4 relative">发布文章、见证或代祷，与弟兄姊妹同行。</p>
                <Link href="/community/create" className="relative block w-full py-3 rounded-xl bg-white text-primary-700 font-semibold text-center hover:bg-primary-50 transition-colors">
                  立即发布
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 平台治理团队公示：每个模块由谁负责，公开透明 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        <GovernanceTeam />
      </section>
    </div>
  );
}
