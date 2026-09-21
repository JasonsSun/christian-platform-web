'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { qs, apiPost, apiDelete, clearApiCache } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { timeAgo, formatDate } from '@/lib/format';
import type { ContentItem, ListResult } from '@/lib/types';
import { ContentCardSkeleton } from '@/components/Skeleton';
import { Glyph, IconArrowLeft, IconArrowRight, IconChatDots, IconDocument, IconHeart, IconStar } from '@/components/icons';

interface TopicOverview {
  tag: string;
  count: number;
  likes: number;
  views: number;
  comments: number;
  firstAt: string;
  lastAt: string;
  types: { type: string; count: number }[];
  authors: { id: string; name: string; color: string; count: number }[];
  related: { name: string; count: number }[];
  recent: { id: string; title: string; contentType: string; at: string; authorName: string }[];
  empty: boolean;
  loggedIn: boolean;
  following: boolean;
  followers: number;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  testimony: { label: '见证', cls: 'bg-gold-50 text-gold-700 border-gold-200' },
  prayer: { label: '代祷', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  article: { label: '分享', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  devotion: { label: '灵修', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  media: { label: '媒体', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

const TYPE_TABS = [
  { id: 'all', label: '全部' },
  { id: 'testimony', label: '见证' },
  { id: 'article', label: '分享' },
  { id: 'devotion', label: '灵修' },
  { id: 'prayer', label: '代祷' },
  { id: 'media', label: '媒体' },
];

const PAGE_SIZE = 10;

export default function TopicDetailPage() {
  const params = useParams<{ tag: string }>();
  const router = useRouter();
  const raw = params?.tag || '';
  let tag = raw;
  try {
    tag = decodeURIComponent(raw);
  } catch {
    /* 保持原样 */
  }

  const [type, setType] = useState('all');
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [page, setPage] = useState(1);
  const [followBusy, setFollowBusy] = useState(false);

  // 注意：这里刻意不做整页 loading 分支 —— Hero 用 URL 上的 tag 立即渲染，
  // 保证 SSR 首屏就有话题标题（对分享/SEO 友好），下半部分各自出骨架。
  const { data: ov, setData: setOv } = useApi<TopicOverview>(tag ? `/topics/${encodeURIComponent(tag)}` : null, [tag]);

  /** 关注/取关：乐观更新概览里的 following/followers，失败回滚 */
  const toggleFollow = async () => {
    if (!ov) return;
    if (!ov.loggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/topics/${encodeURIComponent(tag)}`)}`);
      return;
    }
    const was = ov.following;
    setFollowBusy(true);
    setOv((prev) =>
      prev
        ? { ...prev, following: !was, followers: Math.max(0, prev.followers + (was ? -1 : 1)) }
        : prev
    );
    try {
      if (was) await apiDelete(`/me/topics/${encodeURIComponent(tag)}`);
      else await apiPost('/me/topics', { tag });
      clearApiCache('/topics');
    } catch {
      setOv((prev) =>
        prev ? { ...prev, following: was, followers: Math.max(0, prev.followers + (was ? 1 : -1)) } : prev
      );
    } finally {
      setFollowBusy(false);
    }
  };

  const listPath =
    tag
      ? `/contents${qs({
          tag,
          status: 'published',
          type: type === 'all' ? undefined : type,
          sort,
          page,
          pageSize: PAGE_SIZE,
        })}`
      : null;
  const { data: list, loading: listLoading, error: listError, reload: reloadList } = useApi<ListResult<ContentItem>>(listPath, [tag, type, sort, page]);

  const items = list?.items || [];
  const total = list?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-10 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 mesh-bg opacity-70" />
        <div className="absolute inset-0 dot-grid opacity-25" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/topics" className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-4 transition-colors min-h-[44px]">
            <IconArrowLeft className="w-4 h-4" strokeWidth={1.6} />
            返回话题广场
          </Link>
          <div className="eyebrow mb-2"><span className="text-gold-200/90">TOPIC</span></div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white text-glow break-words">
              #{ov?.tag || tag}
            </h1>
            <button
              onClick={toggleFollow}
              disabled={followBusy}
              aria-pressed={ov?.following}
              className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors disabled:opacity-60 flex items-center gap-1.5 flex-shrink-0 ${
                ov?.following
                  ? 'border-gold-300/70 bg-gold-400/20 text-gold-200 hover:bg-gold-400/30'
                  : 'border-white/40 text-white/90 hover:bg-white/15'
              }`}
            >
              <IconStar className={`w-4 h-4 ${ov?.following ? 'fill-current' : ''}`} strokeWidth={1.6} />
              {ov?.following ? '已关注' : '关注话题'}
              {!!ov?.followers && <span className="num text-xs opacity-80">{ov.followers} 人</span>}
            </button>
          </div>
          {ov && !ov.empty && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-white/85 text-sm">
              <span><span className="num font-semibold">{ov.count}</span> 篇内容</span>
              <span>·</span>
              <span><span className="num font-semibold">{ov.likes}</span> 次点赞</span>
              <span>·</span>
              <span><span className="num font-semibold">{ov.comments}</span> 条评论</span>
              <span>·</span>
              <span><span className="num font-semibold">{ov.views}</span> 次浏览</span>
              {ov.lastAt && (
                <>
                  <span>·</span>
                  <span>最近 {timeAgo(ov.lastAt)}</span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {ov?.empty ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-ink-200 text-ink-400">
              话题 <b className="text-ink-700">#{ov.tag}</b> 下还没有已发布的内容
              <div className="mt-3">
                <Link
                  href="/community/create"
                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline min-h-[44px]"
                >
                  发布一篇并带上这个标签
                  <IconArrowRight className="w-4 h-4" strokeWidth={1.6} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6 md:gap-8 items-start">
              {/* 左侧内容流 */}
              <div className="lg:col-span-2 space-y-5 min-w-0">
                <div className="bg-white rounded-2xl p-4 shadow-soft border border-ink-100 flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-2 min-w-0">
                    {TYPE_TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setType(t.id);
                          setPage(1);
                        }}
                        aria-pressed={type === t.id}
                        className={`px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                          type === t.id
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                            : 'bg-ink-50 text-ink-600 hover:bg-primary-50 hover:text-primary-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex gap-1 bg-ink-50 rounded-xl p-1">
                    <button
                      onClick={() => {
                        setSort('new');
                        setPage(1);
                      }}
                      aria-pressed={sort === 'new'}
                      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-medium transition-colors ${
                        sort === 'new' ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      最新
                    </button>
                    <button
                      onClick={() => {
                        setSort('hot');
                        setPage(1);
                      }}
                      aria-pressed={sort === 'hot'}
                      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-sm font-medium transition-colors ${
                        sort === 'hot' ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      最热
                    </button>
                  </div>
                </div>

                {listLoading && items.length === 0 && (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <ContentCardSkeleton key={i} />
                    ))}
                  </div>
                )}

                {/* 翻页失败原先只抬 listLoading 又落下，旧数据被新页覆盖不了时
                    看起来就像「这一页没有内容」；第一页失败更是直接被空态吃掉 */}
                {listError && items.length === 0 && (
                  <div className="bg-white rounded-2xl p-10 text-center border border-rose-200">
                    <p className="text-sm text-rose-600 mb-4">{listError}</p>
                    <button onClick={reloadList} className="btn-secondary">重试</button>
                  </div>
                )}
                {listError && items.length > 0 && (
                  <p role="alert" className="mb-3 text-sm text-rose-600">
                    {listError} <button onClick={reloadList} className="underline ml-1">重试</button>
                  </p>
                )}

                {!listLoading && !listError && items.length === 0 && (
                  <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-ink-200 text-ink-400">
                    该筛选条件下没有内容
                  </div>
                )}

                <div data-reveal-group className={`space-y-4 transition-opacity duration-200 ${listLoading && items.length ? 'opacity-60' : 'opacity-100'}`}>
                  {items.map((item) => {
                    const badge = TYPE_BADGE[item.contentType];
                    return (
                      <article
                        key={item.id}
                        data-spot
                        className="spot card-tech rounded-2xl p-5 group"
                      >
                        <Link href={`/contents/${item.id}`} className="flex gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-ink-600 flex-shrink-0">
                            {item.cover && item.cover !== '📄' ? (
                              <Glyph glyph={item.cover} className="w-6 h-6" />
                            ) : (
                              <IconDocument className="w-6 h-6" strokeWidth={1.6} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {badge && (
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                            <h3 className="font-display font-bold text-lg text-ink-900 truncate group-hover:text-primary-700 transition-colors">
                              {item.title}
                            </h3>
                            <p className="text-sm text-ink-500 line-clamp-2 mt-1 leading-relaxed">
                              {item.excerpt || item.body?.slice(0, 90)}
                            </p>
                          </div>
                        </Link>
                        <div className="flex items-center gap-3 mt-4 text-sm text-ink-500">
                          <span
                            className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
                            style={{
                              backgroundColor: item.author?.avatarColor || '#3d52d9',
                              width: 26,
                              height: 26,
                              fontSize: 11,
                            }}
                          >
                            {(item.author?.displayName || item.author?.username || '?').slice(0, 1)}
                          </span>
                          <span className="text-ink-700 font-medium">{item.author?.displayName}</span>
                          <span className="text-ink-400">·</span>
                          <span>{timeAgo(item.publishedAt || item.createdAt)}</span>
                          <div className="ml-auto flex items-center gap-4">
                            <span className="flex items-center gap-1">
                              <IconHeart className="w-4 h-4" strokeWidth={1.6} />
                              <span className="sr-only">点赞</span><span className="num">{item.likeCount}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <IconChatDots className="w-4 h-4" strokeWidth={1.6} />
                              <span className="sr-only">评论</span><span className="num">{item.commentCount}</span>
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {maxPage > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 min-h-[44px] rounded-xl border border-ink-200 text-sm text-ink-600 disabled:opacity-40 hover:border-primary-300 transition-colors"
                    >
                      上一页
                    </button>
                    <span className="num text-sm text-ink-500">
                      {page} / {maxPage}
                    </span>
                    <button
                      disabled={page >= maxPage}
                      onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                      className="px-4 py-2 min-h-[44px] rounded-xl border border-ink-200 text-sm text-ink-600 disabled:opacity-40 hover:border-primary-300 transition-colors"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>

              {/* 右侧侧栏 */}
              <aside className="space-y-5 min-w-0">
                {ov && ov.types.length > 0 && (
                  <div className="bg-white rounded-2xl p-5 shadow-soft border border-ink-100">
                    <h3 className="font-display font-bold text-ink-900 mb-3">内容构成</h3>
                    <div className="space-y-2">
                      {ov.types.map((t) => {
                        const pct = Math.round((t.count / Math.max(1, ov.count)) * 100);
                        const badge = TYPE_BADGE[t.type];
                        return (
                          <div key={t.type}>
                            <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                              <span>{badge?.label || t.type}</span>
                              <span className="num">
                                {t.count} 篇 · {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden" aria-hidden>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400"
                                style={{ width: `${Math.max(3, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {ov && ov.authors.length > 0 && (
                  <div className="bg-white rounded-2xl p-5 shadow-soft border border-ink-100">
                    <h3 className="font-display font-bold text-ink-900 mb-3">主要作者</h3>
                    <div className="space-y-2.5">
                      {ov.authors.map((a) => (
                        <Link
                          key={a.id}
                          href={`/users/${a.id}`}
                          className="flex items-center gap-2.5 group min-h-[44px]"
                        >
                          <span
                            className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
                            style={{ backgroundColor: a.color || '#3d52d9', width: 28, height: 28, fontSize: 12 }}
                          >
                            {(a.name || '?').slice(0, 1)}
                          </span>
                          <span className="text-sm text-ink-700 group-hover:text-primary-700 truncate">{a.name}</span>
                          <span className="num ml-auto text-xs text-ink-400 flex-shrink-0">{a.count} 篇</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {ov && ov.related.length > 0 && (
                  <div className="bg-white rounded-2xl p-5 shadow-soft border border-ink-100">
                    <h3 className="font-display font-bold text-ink-900 mb-3">相关话题</h3>
                    <div className="flex flex-wrap gap-2">
                      {ov.related.map((r) => (
                        <Link
                          key={r.name}
                          href={`/topics/${encodeURIComponent(r.name)}`}
                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-full bg-ink-50 text-ink-600 text-xs hover:bg-primary-50 hover:text-primary-700 transition-colors"
                        >
                          #{r.name}
                          <span className="num text-ink-400">{r.count}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {ov?.firstAt && (
                  <div className="bg-white rounded-2xl p-5 shadow-soft border border-ink-100 text-xs text-ink-400 space-y-1">
                    <div>首次出现：{formatDate(ov.firstAt)}</div>
                    <div>最近更新：{formatDate(ov.lastAt)}</div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
