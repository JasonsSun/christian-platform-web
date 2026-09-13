'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { countdown, timeAgo } from '@/lib/format';
import { usePlayer, formatTime } from '@/lib/player';
import ShareButton from '@/components/ShareButton';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { ActivityItem, ContentItem, GroupItem, MediaItem, PrayerItem, SongItem } from '@/lib/types';

type HomeData = {
  stats: { users: number; contents: number; activities: number; songs: number; groups: number; prayers: number };
  featured: ContentItem[];
  activities: ActivityItem[];
  songs: SongItem[];
  groups: GroupItem[];
  prayers: PrayerItem[];
  verse: { bookId: string; bookName: string; chapter: number; verse: number; text: string } | null;
};

const features = [
  { tkey: 'bible', href: '/bible', gradient: 'from-primary-500 to-primary-700', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { tkey: 'songs', href: '/songs', gradient: 'from-gold-500 to-gold-700', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
  { tkey: 'testimony', href: '/community', gradient: 'from-warm-600 to-warm-800', icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58' },
  { tkey: 'activities', href: '/activities', gradient: 'from-emerald-500 to-emerald-700', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { tkey: 'groups', href: '/groups', gradient: 'from-purple-500 to-purple-700', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { tkey: 'notify', href: '/notifications', gradient: 'from-rose-500 to-rose-700', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
];

const RECENT_SEARCH_KEY = 'platform_recent_searches';
const MAX_RECENT = 8;

function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(q: string) {
  const list = loadRecentSearches().filter((s) => s !== q);
  list.unshift(q);
  const next = list.slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type HomeClientProps = {
  /** 服务端(ISR,60s)预取的首页聚合数据,首屏直出、避免空白等待 */
  initialHome?: HomeData | null;
  /** 服务端预取的公开媒体列表 */
  initialMedia?: MediaItem[] | null;
};

export default function HomeClient({ initialHome = null, initialMedia = null }: HomeClientProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const player = usePlayer();
  const { data, loading } = useApi<HomeData>('/home', [], initialHome);
  const { data: media } = useApi<{ items: MediaItem[] }>(
    '/media?pageSize=16',
    [],
    initialMedia ? { items: initialMedia } : null,
  );
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(loadRecentSearches());
  }, []);

  const av = useMemo(
    () => (media?.items || []).filter((m) => m.kind === 'video' || m.kind === 'audio').slice(0, 6),
    [media],
  );

  const stats = data?.stats;
  const statCards = useMemo(
    () => [
      { value: stats?.users ?? '-', label: 'home.stats.users' },
      { value: stats?.contents ?? '-', label: 'home.stats.contents' },
      { value: stats?.activities ?? '-', label: 'home.stats.activities' },
      { value: stats?.songs ?? '-', label: 'home.stats.songs' },
      { value: stats?.groups ?? '-', label: 'home.stats.groups' },
      { value: stats?.prayers ?? '-', label: 'home.stats.prayers' },
    ],
    [stats],
  );

  const handleSearch = (q: string) => {
    const keyword = q.trim();
    if (!keyword) return;
    saveRecentSearch(keyword);
    setRecents(loadRecentSearches());
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Hero */}
      <section className="relative min-h-[88vh] md:min-h-screen flex items-center overflow-hidden py-12 md:py-0">
        <div className="absolute inset-0 bg-animated-gradient" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 -left-20 w-72 h-72 bg-gold-400/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl animate-float" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div className="text-white animate-slide-up text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-md border border-white/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
                <span className="text-sm font-medium">{t('home.heroBadge')}</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-4 md:mb-6">
                {t('home.heroTitle1')}<span className="text-gold-400">·</span>{t('home.heroTitle2')}
                <br />
                <span className="text-gradient bg-gradient-to-r from-white via-primary-200 to-gold-300 bg-clip-text text-transparent">{t('home.heroTitle3')}</span>
              </h1>

              <p className="text-base md:text-lg text-white/80 mb-3 md:mb-4 leading-relaxed font-serif italic">
                {t('home.heroQuote')}
              </p>
              <p className="text-white/60 mb-6 md:mb-10 text-sm md:text-base">{t('home.heroQuoteRef')}</p>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center lg:justify-start">
                <Link href="/bible" className="btn-gold text-base w-full sm:w-auto">{t('home.startReading')}</Link>
                {user ? (
                  <Link href="/community/create" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto">
                    {t('home.publishContent')}
                  </Link>
                ) : (
                  <Link href="/login" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto">
                    {t('home.joinCommunity')}
                  </Link>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-4 pt-6 border-t border-white/10 justify-center lg:justify-start">
                {[['nav.bible', '/bible'], ['nav.plans', '/plans'], ['nav.songs', '/songs'], ['nav.activities', '/activities'], ['nav.groups', '/groups']].map(([labelKey, href]) => (
                  <Link key={href} href={href} className="text-white/70 hover:text-white transition-colors font-medium text-sm md:text-base">
                    {t(labelKey)}
                  </Link>
                ))}
              </div>
            </div>

            <div className="relative animate-slide-up" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
              <div className="glass rounded-3xl p-6 md:p-8 shadow-card-hover max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-gold">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13" />
                    </svg>
                  </div>
                  <div>
                  <div className="font-semibold text-ink-900">{t('home.verseTitle')}</div>
                  <div className="text-sm text-ink-500">{t('home.verseSub')}</div>
                  </div>
                </div>
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-ink-100 rounded" />
                    <div className="h-4 bg-ink-100 rounded w-5/6" />
                    <div className="h-4 bg-ink-100 rounded w-2/3" />
                  </div>
                ) : data?.verse ? (
                  <>
                    <div className="font-serif text-lg text-ink-800 leading-relaxed mb-4">“{data.verse.text}”</div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <Link href={`/bible/cuv/${data.verse.bookId}/${data.verse.chapter}`} className="text-sm text-primary-600 font-medium hover:underline">
                        —— {data.verse.bookName} {data.verse.chapter}:{data.verse.verse}
                      </Link>
                      <ShareButton
                        label="分享卡片"
                        withText
                        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                        title={`${data.verse.bookName} ${data.verse.chapter}:${data.verse.verse}`}
                        card={{
                          eyebrow: '每日经文',
                          text: data.verse.text,
                          reference: `${data.verse.bookName} ${data.verse.chapter}:${data.verse.verse}`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-ink-400 text-sm">{t('home.noVerse')}</div>
                )}
                <div className="mt-6 pt-6 border-t border-ink-200 flex items-center justify-between text-sm">
                  <span className="text-ink-500">{t('home.communityNote')}</span>
                  <Link href="/community" className="text-primary-600 font-medium hover:underline">{t('home.communityLink')}</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f6f7fb] to-transparent" />
      </section>

      {/* 统计 */}
      <section className="relative py-10 md:py-14 -mt-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass rounded-3xl p-6 md:p-10 shadow-card grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
            {statCards.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-display text-2xl md:text-4xl font-bold text-gradient">{s.value}</div>
                <div className="text-ink-500 font-medium text-xs md:text-sm mt-1">{t(s.label)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 最近搜索快捷入口 */}
      <section className="py-6 md:py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-5 md:p-6 shadow-soft border border-ink-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-ink-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {t('home.recentSearch')}
              </h3>
              {recents.length > 0 && (
                <button
                  onClick={() => {
                    try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch { /* ignore */ }
                    setRecents([]);
                  }}
                    className="text-xs text-ink-400 hover:text-rose-500 transition-colors"
                  >
                    {t('home.clear')}
                  </button>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const input = f.elements.namedItem('q') as HTMLInputElement;
                handleSearch(input.value);
              }}
              className="relative mb-3"
            >
              <input
                name="q"
                aria-label={t('home.searchPlaceholder')}
                placeholder={t('home.searchPlaceholder')}
                className="w-full pl-4 pr-28 py-3 rounded-xl border-2 border-ink-200 bg-ink-50/50 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary px-4 py-1.5 text-sm">{t('home.search')}</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {recents.length > 0 ? recents.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSearch(q)}
                  className="px-3 py-1.5 rounded-full bg-ink-50 hover:bg-primary-50 border border-ink-200 hover:border-primary-300 text-sm text-ink-600 hover:text-primary-700 transition-all"
                >
                  {q}
                </button>
              )) : (
                <p className="text-sm text-ink-400">{t('home.noSearch')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 精选内容 + 侧栏 */}
      <section className="py-10 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-ink-900">{t('home.featured')}</h2>
              <Link href="/community" className="text-primary-600 font-medium hover:underline text-sm">{t('home.viewAll')}</Link>
            </div>
            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white/70 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(data?.featured || []).map((c) => (
                  <Link key={c.id} href={`/contents/${c.id}`} className="block bg-white rounded-2xl p-5 shadow-soft card-hover">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-2xl shrink-0">{c.cover}</div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink-900 mb-1 line-clamp-1">{c.title}</h3>
                        <p className="text-ink-500 text-sm line-clamp-2 mb-2">{c.excerpt}</p>
                        <div className="flex items-center gap-3 text-xs text-ink-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style={{ background: c.author.avatarColor }}>
                              {c.author.displayName.slice(0, 1)}
                            </span>
                            {c.author.displayName}
                          </span>
                          <span>❤ {c.likeCount}</span>
                          <span>💬 {c.commentCount}</span>
                          <span>👁 {c.viewCount}</span>
                          <span>{timeAgo(c.publishedAt || c.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {!data?.featured?.length && <div className="text-ink-400">暂无内容</div>}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-ink-900">{t('home.recentEvents')}</h3>
                <Link href="/activities" className="text-primary-600 text-sm hover:underline">{t('home.allEvents')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.activities || []).map((a) => (
                  <Link key={a.id} href={`/activities/${a.id}`} className="block group">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{a.cover}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-800 group-hover:text-primary-600 line-clamp-1">{a.title}</div>
                        <div className="text-xs text-ink-400">{a.city} · {countdown(a.startAt)} · 已报名 {a.confirmedCount}/{a.capacity}</div>
                      </div>
                    </div>
                  </Link>
                ))}
                {!data?.activities?.length && <div className="text-ink-400 text-sm">{t('home.noEvents')}</div>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-ink-900">{t('home.hotSongs')}</h3>
                <Link href="/songs" className="text-primary-600 text-sm hover:underline">{t('home.allSongs')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.songs || []).map((s) => (
                  <Link key={s.id} href={`/songs/${s.id}`} className="flex items-center justify-between group">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-800 group-hover:text-primary-600 line-clamp-1">{s.title}</div>
                      <div className="text-xs text-ink-400">{s.author || t('home.traditionalHymn')}</div>
                    </div>
                    <span className="text-xs text-ink-400">▶ {s.playCount}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-ink-900">{t('home.prayerWall')}</h3>
                <Link href="/prayers" className="text-primary-600 text-sm hover:underline">{t('home.goPray')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.prayers || []).map((p) => (
                  <div key={p.id} className="text-sm">
                    <p className="text-ink-700 line-clamp-2">{p.body}</p>
                    <div className="text-xs text-ink-400 mt-1">🙏 {p.amenCount} 人阿们 · {timeAgo(p.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 推荐团契 */}
      <section className="py-10 md:py-16 bg-gradient-to-br from-primary-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-ink-900">{t('home.groups')}</h2>
              <p className="text-ink-500 mt-1 text-sm">{t('home.groupsSub')}</p>
            </div>
            <Link href="/groups" className="text-primary-600 font-medium hover:underline text-sm hidden sm:inline">{t('home.allGroups')}</Link>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-white animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(data?.groups || []).map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} className="block bg-white rounded-2xl p-5 shadow-soft card-hover border border-ink-100">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-xl shrink-0">
                      {g.cover || '👥'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink-900 line-clamp-1">{g.name}</h3>
                      <p className="text-xs text-ink-400">{g.category} · {g.city}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-500 line-clamp-2 mb-3">{g.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-400">👥 {t('home.members', { n: g.memberCount })}</span>
                    <span className="text-primary-600 font-medium">进入团契 →</span>
                  </div>
                </Link>
              ))}
              {!data?.groups?.length && <div className="text-ink-400 col-span-full">{t('home.noGroups')}</div>}
            </div>
          )}
          <div className="sm:hidden mt-4 text-center">
            <Link href="/groups" className="text-primary-600 font-medium hover:underline text-sm">{t('home.allGroups')}</Link>
          </div>
        </div>
      </section>

      {/* 影音敬拜 */}
      {av.length > 0 ? (
        <section className="py-10 md:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-6">
              <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-900">{t('home.media')}</h2>
              <p className="text-ink-500 mt-1 text-sm">{t('home.mediaSub')}</p>
              </div>
              <Link href="/media" className="text-primary-600 text-sm hover:underline">{t('home.allMedia')}</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {av.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl overflow-hidden shadow-soft card-hover border border-ink-100">
                  {m.kind === 'video' ? (
                    <Link href={`/media/${m.id}`} className="block relative bg-black" style={{ height: 176 }}>
                      {m.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" src={m.posterUrl} alt={m.title} className="w-full h-full object-cover opacity-90" />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-14 h-14 rounded-full bg-black/45 text-white flex items-center justify-center text-xl backdrop-blur-sm">▶</span>
                      </span>
                      {m.durationSec ? (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[11px]">
                          {formatTime(m.durationSec)}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      aria-label={m.title}
                      onClick={() => player.playTrack({
                        id: m.id, title: m.title, artist: m.owner || '圣约社区', url: m.url,
                        poster: m.posterUrl, durationSec: m.durationSec,
                      })}
                      className="w-full relative bg-gradient-to-br from-primary-500 to-primary-800 flex flex-col items-center justify-center gap-2 group"
                      style={{ height: 176 }}
                    >
                      <span className="w-14 h-14 rounded-full bg-white/95 text-primary-700 flex items-center justify-center text-xl shadow-card group-hover:scale-110 transition">
                        {player.isCurrent(m.id) && player.playing ? '❚❚' : '▶'}
                      </span>
                      <span className="text-xs text-white/85">
                        {m.durationSec ? formatTime(m.durationSec) : '点击试听'}
                      </span>
                    </button>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">{m.kindLabel}</span>
                      {m.playCount ? <span className="text-xs text-ink-400">{t('home.plays', { n: m.playCount })}</span> : null}
                    </div>
                    <Link href={`/media/${m.id}`} className="block mt-2 text-sm font-medium text-ink-900 hover:text-primary-600 line-clamp-1">
                      {m.title}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 功能入口 */}
      <section className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-ink-900 mb-3">{t('home.featuresTitle')}</h2>
            <p className="text-ink-500">{t('home.featuresSub')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Link key={f.href} href={f.href} className="group bg-white rounded-3xl p-7 shadow-soft card-hover">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} text-white flex items-center justify-center mb-5 shadow-lg transition-transform duration-500 group-hover:scale-110`}>
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={f.icon} />
                  </svg>
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2">{t(`home.feat.${f.tkey}.title`)}</h3>
                <p className="text-ink-500 text-sm mb-4">{t(`home.feat.${f.tkey}.desc`)}</p>
                <span className="text-primary-600 font-semibold text-sm flex items-center gap-1">
                  {t('home.experience')}
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 rounded-3xl overflow-hidden shadow-card-hover">
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
            <div className="relative px-8 py-14 md:px-16 text-center">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">{t('home.ctaTitle')}</h2>
              <p className="text-white/85 mb-8">{t('home.ctaSub')}</p>
              <Link href={user ? '/me' : '/login?mode=register'} className="btn-gold text-base px-8 py-4">
                {user ? t('home.ctaBtnLoggedIn') : t('home.ctaBtnGuest')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
