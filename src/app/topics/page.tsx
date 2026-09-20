'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { qs, apiPost, apiDelete, clearApiCache } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { timeAgo } from '@/lib/format';
import { Skeleton } from '@/components/Skeleton';
import {
  IconArrowRight,
  IconBooks,
  IconClock,
  IconFire,
  IconList,
  IconSearch,
  IconStar,
} from '@/components/icons';

interface TopicItem {
  name: string;
  count: number;
  likes: number;
  views: number;
  comments: number;
  lastAt: string;
  heat: number;
  heatPct: number;
  countPct: number;
  following: boolean;
  followers: number;
}

const SORT_TABS = [
  // 标签压到两个字：390px 宽时四个按钮加图标刚好一行，
  // 之前「内容数 / 最近活跃」会被挤成竖排两行。
  { id: 'hot', label: '热度', Icon: IconFire },
  { id: 'count', label: '内容', Icon: IconBooks },
  { id: 'new', label: '活跃', Icon: IconClock },
  { id: 'name', label: '名称', Icon: IconList },
];

const topicHref = (name: string) => `/topics/${encodeURIComponent(name)}`;

export default function TopicsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kw, setKw] = useState('');
  const [sort, setSort] = useState('hot');
  const [onlyFollowing, setOnlyFollowing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, setData } = useApi<{
    items: TopicItem[];
    total: number;
    contentTotal: number;
    loggedIn: boolean;
  }>(`/topics${qs({ sort, q: kw || undefined, limit: 120, only: onlyFollowing ? 'following' : undefined })}`, [
    sort,
    kw,
    onlyFollowing,
  ]);

  const loggedIn = !!data?.loggedIn;

  /** 关注/取关。卡片本身是 Link，按钮必须阻止冒泡与默认跳转。 */
  const toggleFollow = async (e: React.MouseEvent, name: string, following: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loggedIn) {
      router.push('/login?next=/topics');
      return;
    }
    setBusy(name);
    // 乐观更新：先翻状态，失败再翻回来，避免弱网下按钮没反应
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((t) =>
              t.name === name
                ? { ...t, following: !following, followers: Math.max(0, t.followers + (following ? -1 : 1)) }
                : t
            ),
          }
        : prev
    );
    try {
      if (following) await apiDelete(`/me/topics/${encodeURIComponent(name)}`);
      else await apiPost('/me/topics', { tag: name });
      clearApiCache('/topics');
    } catch {
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((t) =>
                t.name === name
                  ? { ...t, following, followers: Math.max(0, t.followers + (following ? 1 : -1)) }
                  : t
              ),
            }
          : prev
      );
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items || [];
  const maxHeat = items.reduce((m, t) => Math.max(m, t.heat), 1);

  // 字号按热度分档：热门话题更大，形成标签云层
  const sizeOf = (t: TopicItem) => {
    const r = t.heat / maxHeat;
    if (r > 0.66) return 'text-base sm:text-lg';
    if (r > 0.33) return 'text-sm sm:text-base';
    return 'text-sm';
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-10 md:py-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 mesh-bg opacity-70" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-6 right-10 w-64 h-64 bg-primary-400/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-0 left-10 w-64 h-64 bg-gold-400/15 rounded-full blur-3xl animate-float-slow" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* 同日历页：白 12% 的磨砂片把 hero 带子提到 rgb(71,100,255)，白字只剩 4.07，换深色底片。 */}
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink-950/30 border border-white/20 text-white/90 text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
            全站话题聚合
          </span>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 text-glow">
            话题广场
          </h1>
          <p className="text-white/85 max-w-2xl mx-auto font-serif italic">
            “凡是真实的、可敬的、公义的、清洁的……这些事你们都要思念。” —— 腓立比书 4:8
          </p>
          {/* 槽位恒定：这行统计要等接口回来才出现，一出现就把 hero 撑高 48px，
              下面的整块广场跟着往下跳（实测 /topics 桌面端 CLS 0.053 的来源）。 */}
          <div className="mt-5 h-7 flex items-center justify-center gap-6 text-white/90 text-sm">
            {data ? (
              <>
                <span>
                  <b data-count className="num text-lg font-display font-bold">{data.total}</b> 个话题
                </span>
                <span className="w-px h-4 bg-white/30" />
                <span>
                  <b data-count className="num text-lg font-display font-bold">{data.contentTotal}</b> 篇带标签内容
                </span>
              </>
            ) : (
              <>
                <span className="skeleton-sheen block h-4 w-20 rounded-full bg-white/15" aria-hidden />
                <span className="skeleton-sheen block h-4 w-28 rounded-full bg-white/15" aria-hidden />
              </>
            )}
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 搜索 + 排序 */}
          <div className="bg-white rounded-2xl p-4 mb-6 shadow-soft border border-ink-100 flex flex-wrap items-center gap-3">
            <form
              className="relative flex-1 min-w-[200px]"
              onSubmit={(e) => {
                e.preventDefault();
                setKw(q.trim());
              }}
            >
              <IconSearch className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.6} />
              <input
                aria-label="搜索话题"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索话题，如：信心、祷告、家庭…"
                className="input-styled input-icon"
              />
            </form>
            <div className="flex gap-1 bg-ink-50 rounded-xl p-1 overflow-x-auto" role="group" aria-label="话题排序">
              {SORT_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSort(t.id)}
                  aria-pressed={sort === t.id}
                  className={`px-2.5 sm:px-3 py-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 shrink-0 whitespace-nowrap ${
                    sort === t.id ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  <t.Icon className="w-3.5 h-3.5" strokeWidth={1.6} />
                  {t.label}
                </button>
              ))}
            </div>
            {loggedIn && (
              <button
                onClick={() => setOnlyFollowing((v) => !v)}
                aria-pressed={onlyFollowing}
                className={`px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  onlyFollowing
                    ? 'border-gold-300 bg-gold-50 text-gold-700 shadow-sm'
                    : 'border-ink-200 text-ink-600 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                <IconStar className={`w-3.5 h-3.5 ${onlyFollowing ? 'fill-current' : ''}`} strokeWidth={1.6} />
                我的关注
              </button>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm mb-5">{error}</div>
          )}

          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                // 每一块都对齐真实卡片的行（标题 / 元信息 / 热度条 / 底部含关注按钮），
                // 否则数据回填时每张卡长高 ~48px，整个网格把下方内容往下推。
                <div key={i} className="card-tech rounded-2xl p-5 space-y-3">
                  <Skeleton className="h-6 w-2/5 skeleton-sheen" />
                  <Skeleton className="h-3 w-3/4 skeleton-sheen" />
                  <Skeleton className="h-1.5 w-full skeleton-sheen" />
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-16 skeleton-sheen" />
                    <Skeleton className="h-9 w-20 rounded-full skeleton-sheen" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-ink-200">
              <p className="text-ink-400">
                {onlyFollowing
                  ? '你还没有关注任何话题，点卡片上的关注就能收进来'
                  : kw
                  ? `没有匹配「${kw}」的话题`
                  : '还没有带标签的已发布内容'}
              </p>
              <div className="mt-3">
                {onlyFollowing ? (
                  <button
                    onClick={() => setOnlyFollowing(false)}
                    className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    去话题广场逛逛
                    <IconArrowRight className="w-4 h-4" strokeWidth={1.6} />
                  </button>
                ) : (
                  <Link
                    href="/community/create"
                    className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    去发布第一条
                    <IconArrowRight className="w-4 h-4" strokeWidth={1.6} />
                  </Link>
                )}
              </div>
            </div>
          )}

          <div data-reveal-group className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t, i) => (
              <div
                key={t.name}
                data-spot
                className="spot card-tech rounded-2xl p-5 group relative overflow-hidden"
              >
                {/* 整卡跳转用铺满式链接，关注按钮才能合法地留在卡内（<a> 里不能套交互元素） */}
                <Link
                  href={topicHref(t.name)}
                  aria-label={`查看话题 ${t.name}`}
                  className="absolute inset-0"
                />
                {/* 排名前三的话题打上金标 */}
                {sort === 'hot' && i < 3 && (
                  <span className="absolute top-0 right-0 px-2.5 py-1 rounded-bl-xl text-[11px] font-semibold bg-gradient-to-r from-gold-400 to-gold-600 text-ink-950">
                    TOP {i + 1}
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <span
                    className={`font-display font-bold text-ink-900 truncate group-hover:text-primary-700 transition-colors ${sizeOf(t)}`}
                  >
                    #{t.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-500 mb-3">
                  <span><span className="num">{t.count}</span> 篇内容</span>
                  <span className="text-ink-400">·</span>
                  <span><span className="num">{t.likes}</span> 赞</span>
                  <span className="text-ink-400">·</span>
                  <span><span className="num">{t.comments}</span> 评论</span>
                </div>

                {/* 热度条 */}
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden" aria-hidden>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary-500 via-primary-400 to-gold-400 transition-all duration-500"
                    style={{ width: `${t.heatPct}%` }}
                  />
                </div>

                {/* 11px 的元信息行：ink-400 在浅灰卡片上实测 4.23~4.31，小字号要 4.5，提到 ink-600（6.06）。 */}
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-600">
                  <span>热度 <span className="num">{t.heat}</span></span>
                  <div className="flex items-center gap-2">
                    {t.lastAt ? <span>{timeAgo(t.lastAt)}活跃</span> : null}
                    <button
                      onClick={(e) => toggleFollow(e, t.name, t.following)}
                      disabled={busy === t.name}
                      aria-pressed={t.following}
                      aria-label={t.following ? `取消关注话题 ${t.name}` : `关注话题 ${t.name}`}
                      className={`relative z-10 inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-full border text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        t.following
                          ? 'border-gold-300 bg-gold-50 text-gold-700'
                          : 'border-ink-200 text-ink-500 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      <IconStar className="w-3 h-3 shrink-0" strokeWidth={1.6} fill={t.following ? 'currentColor' : 'none'} />
                      {t.following ? '已关注' : '关注'}
                      {t.followers > 0 && <span className="num opacity-70">{t.followers}</span>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && data && data.total > items.length && (
            <p className="text-center text-sm text-ink-400 mt-6">
              已显示 <span className="num">{items.length}</span> 个话题（共 <span className="num">{data.total}</span> 个）
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
