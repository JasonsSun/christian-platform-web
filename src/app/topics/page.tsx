'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { qs, apiPost, apiDelete, clearApiCache } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { timeAgo } from '@/lib/format';
import { Skeleton } from '@/components/Skeleton';

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
  { id: 'hot', label: '热度', icon: '🔥' },
  { id: 'count', label: '内容', icon: '📚' },
  { id: 'new', label: '活跃', icon: '🕒' },
  { id: 'name', label: '名称', icon: '🔤' },
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
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-tech text-white/90 text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
            全站话题聚合
          </span>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 text-glow">
            话题广场
          </h1>
          <p className="text-white/85 max-w-2xl mx-auto font-serif italic">
            “凡是真实的、可敬的、公义的、清洁的……这些事你们都要思念。” —— 腓立比书 4:8
          </p>
          {data && (
            <div className="mt-5 flex items-center justify-center gap-6 text-white/90 text-sm">
              <span>
                <b className="text-lg font-display">{data.total}</b> 个话题
              </span>
              <span className="w-px h-4 bg-white/30" />
              <span>
                <b className="text-lg font-display">{data.contentTotal}</b> 篇带标签内容
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 搜索 + 排序 */}
          <div className="card-tech rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
            <form
              className="relative flex-1 min-w-[200px]"
              onSubmit={(e) => {
                e.preventDefault();
                setKw(q.trim());
              }}
            >
              <svg
                className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索话题，如：信心、祷告、家庭…"
                className="input-styled input-icon"
              />
            </form>
            <div className="flex gap-1 bg-ink-50 rounded-xl p-1 overflow-x-auto">
              {SORT_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSort(t.id)}
                  className={`px-2.5 sm:px-3 py-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 shrink-0 whitespace-nowrap ${
                    sort === t.id ? 'text-primary-700 bg-white shadow-sm' : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  <span className="text-xs">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            {loggedIn && (
              <button
                onClick={() => setOnlyFollowing((v) => !v)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-1.5 ${
                  onlyFollowing
                    ? 'border-gold-300 bg-gold-50 text-gold-700 shadow-sm'
                    : 'border-ink-200 text-ink-600 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                <span className="text-xs">★</span>
                我的关注
              </button>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl p-4 text-sm mb-5">{error}</div>
          )}

          {loading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="card-tech rounded-2xl p-5 space-y-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="card-tech rounded-2xl p-10 text-center text-ink-400">
              {onlyFollowing
                ? '你还没有关注任何话题，点卡片上的 ☆ 就能关注'
                : kw
                ? `没有匹配「${kw}」的话题`
                : '还没有带标签的已发布内容'}
              <div className="mt-3">
                {onlyFollowing ? (
                  <button onClick={() => setOnlyFollowing(false)} className="text-primary-600 hover:underline">
                    去话题广场逛逛 →
                  </button>
                ) : (
                  <Link href="/community/create" className="text-primary-600 hover:underline">
                    去发布第一条 →
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t, i) => (
              <Link
                key={t.name}
                href={topicHref(t.name)}
                className="card-tech rounded-2xl p-5 group relative overflow-hidden"
              >
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
                  <span>{t.count} 篇内容</span>
                  <span className="text-ink-400">·</span>
                  <span>{t.likes} 赞</span>
                  <span className="text-ink-400">·</span>
                  <span>{t.comments} 评论</span>
                </div>

                {/* 热度条 */}
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary-500 via-primary-400 to-gold-400 transition-all duration-500"
                    style={{ width: `${t.heatPct}%` }}
                  />
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-400">
                  <span>热度 {t.heat}</span>
                  <div className="flex items-center gap-2">
                    {t.lastAt ? <span>{timeAgo(t.lastAt)}活跃</span> : null}
                    <button
                      onClick={(e) => toggleFollow(e, t.name, t.following)}
                      disabled={busy === t.name}
                      className={`relative z-10 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all disabled:opacity-50 ${
                        t.following
                          ? 'border-gold-300 bg-gold-50 text-gold-700'
                          : 'border-ink-200 text-ink-500 hover:border-primary-300 hover:text-primary-700'
                      }`}
                    >
                      {t.following ? '★ 已关注' : '☆ 关注'}
                      {t.followers > 0 && <span className="ml-1 opacity-70">{t.followers}</span>}
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {!loading && data && data.total > items.length && (
            <p className="text-center text-sm text-ink-400 mt-6">
              已显示 {items.length} 个话题（共 {data.total} 个）
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
