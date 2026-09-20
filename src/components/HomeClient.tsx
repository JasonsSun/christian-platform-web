'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { countdown, timeAgo } from '@/lib/format';
import { groupCategoryLabel } from '@/lib/labels';
import { usePlayer, formatTime } from '@/lib/player';
import ShareButton from '@/components/ShareButton';
import OnboardingCard from '@/components/OnboardingCard';
import HomeCheckinCard from '@/components/HomeCheckinCard';
import SectionHead from '@/components/SectionHead';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useModuleFilter } from '@/lib/useSiteModules';
import {
  Glyph,
  IconArrowRight,
  IconBell,
  IconBookOpen,
  IconCalendar,
  IconChatDots,
  IconChevronRight,
  IconClock,
  IconEye,
  IconHeart,
  IconMusicNote,
  IconPause,
  IconPlay,
  IconPray,
  IconSearch,
  IconSparkles,
  IconUsers,
} from '@/components/icons';
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
  { tkey: 'bible', href: '/bible', gradient: 'from-primary-500 to-primary-700', Icon: IconBookOpen },
  { tkey: 'songs', href: '/songs', gradient: 'from-gold-500 to-gold-700', Icon: IconMusicNote },
  { tkey: 'testimony', href: '/community', gradient: 'from-warm-600 to-warm-800', Icon: IconPray },
  { tkey: 'activities', href: '/activities', gradient: 'from-emerald-500 to-emerald-700', Icon: IconCalendar },
  { tkey: 'groups', href: '/groups', gradient: 'from-purple-500 to-purple-700', Icon: IconUsers },
  { tkey: 'notify', href: '/notifications', gradient: 'from-rose-500 to-rose-700', Icon: IconBell },
];

type HomeIcon = typeof IconBookOpen;

/** Hero 底部的快捷入口：图标 + 文案，热区保持 44px（移动端 taps2 门）。 */
const quickLinks: { labelKey: string; href: string; Icon: HomeIcon }[] = [
  { labelKey: 'nav.bible', href: '/bible', Icon: IconBookOpen },
  { labelKey: 'nav.plans', href: '/plans', Icon: IconCalendar },
  { labelKey: 'nav.songs', href: '/songs', Icon: IconMusicNote },
  { labelKey: 'nav.activities', href: '/activities', Icon: IconSparkles },
  { labelKey: 'nav.groups', href: '/groups', Icon: IconUsers },
  { labelKey: 'nav.sermons', href: '/sermons', Icon: IconClock },
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
  // 已下线模块的入口（快捷宫格与底部入口）不展示
  const { isOff } = useModuleFilter();
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
      {/* Hero：主内容在 <main className="pt-16 md:pt-20"> 里，min-h 若写成整屏会再叠上
          header 那 64/80px，底部凭空多出一条空白带。扣掉 header 才刚好铺满一屏。 */}
      <section className="relative min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-5rem)] flex items-center overflow-hidden py-10 md:py-14">
        <div className="absolute inset-0 bg-animated-gradient" />
        <div className="absolute inset-0 mesh-bg opacity-60" />
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 -left-20 w-72 h-72 bg-gold-400/20 rounded-full blur-3xl animate-float-orbit" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-300/20 rounded-full blur-3xl animate-float-orbit" style={{ animationDelay: '-4s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-glow-pulse" />
          <div className="absolute top-[15%] right-[20%] w-3 h-3 rounded-full bg-gold-300/80 shadow-gold animate-float" />
          <div className="absolute top-[35%] left-[12%] w-2 h-2 rounded-full bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.6)] animate-float-slow" />
          <div className="absolute bottom-[25%] right-[15%] w-2.5 h-2.5 rounded-full bg-primary-200/80 shadow-[0_0_14px_rgba(107,142,255,0.6)] animate-float" style={{ animationDelay: '-2s' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div className="text-white animate-slide-up text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-on-dark mb-6 max-w-full shadow-[0_0_20px_rgba(79,109,245,0.15)]">
                <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse shrink-0 shadow-gold" />
                <div className="relative overflow-hidden marquee-mask w-48 sm:w-60">
                  <div className="marquee-track text-sm font-medium">
                    <span className="mr-8">{t('home.heroBadge')} ·&nbsp;</span>
                    <span className="mr-8">{t('home.heroBadge')} ·&nbsp;</span>
                  </div>
                </div>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-4 md:mb-6">
                {t('home.heroTitle1')}<span className="text-gold-400 text-glow">·</span>{t('home.heroTitle2')}
                <br />
                <span className="text-gradient bg-gradient-to-r from-white via-primary-200 to-gold-300 bg-clip-text text-transparent text-glow">{t('home.heroTitle3')}</span>
              </h1>

              {/* 经文章句压一条金色发丝：原先两行孤立文本，读不出「这是一句引用的经文」 */}
              <div className="border-l-2 border-gold-400/70 pl-4 mb-6 md:mb-10 text-left">
                <p className="text-base md:text-lg text-white/80 leading-relaxed font-serif italic">
                  {t('home.heroQuote')}
                </p>
                <p className="text-white/70 mt-1 text-sm md:text-base">{t('home.heroQuoteRef')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center lg:justify-start">
                <Link href="/bible" className="btn-gold btn-shimmer text-base w-full sm:w-auto shadow-glow-gold">{t('home.startReading')}</Link>
                {user ? (
                  <Link href="/community/create" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/50 w-full sm:w-auto glass-on-dark">
                    {t('home.publishContent')}
                  </Link>
                ) : (
                  <Link href="/login" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/50 w-full sm:w-auto glass-on-dark">
                    {t('home.joinCommunity')}
                  </Link>
                )}
              </div>

              {/* 六个快捷入口：纯文字链接压在一整片渐变上看不清边界，改成玻璃胶囊。
                  胶囊本身 py-3 + 20px 文字 = 44px 热区（移动端 taps2 门），不换行时
                  整块高度与改造前的单行链接一致。 */}
              <div className="mt-6 flex flex-wrap gap-2 md:gap-3 pt-3 border-t border-white/10 justify-center lg:justify-start">
                {quickLinks.filter((l) => !isOff(l.href)).map(({ labelKey, href, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group inline-flex items-center gap-1.5 px-3 py-3 md:px-3.5 rounded-full glass-on-dark text-white/85 hover:text-white text-sm md:text-[15px] font-medium transition-colors"
                  >
                    <Icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                    {t(labelKey)}
                  </Link>
                ))}
              </div>
            </div>

            <div className="relative animate-slide-up" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
              {/* is-active：hero 主推面板常驻一圈发丝渐变描边，hover 时再亮起；
                  data-spot 让指针柔光只在这块卡片上跟随。 */}
              <div data-spot className="spot glow-edge is-active card-tech rounded-3xl p-6 md:p-8 shadow-card-hover max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-glow-gold shrink-0">
                    <IconBookOpen className="w-6 h-6 text-white" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0">
                  <div className="eyebrow">{t('home.verseSub')}</div>
                  <div className="font-display font-bold text-ink-900 leading-tight">{t('home.verseTitle')}</div>
                  </div>
                </div>
                {loading ? (
                  <div className="space-y-3">
                    <div className="h-4 bg-ink-100 rounded skeleton-sheen" />
                    <div className="h-4 bg-ink-100 rounded w-5/6 skeleton-sheen" />
                    <div className="h-4 bg-ink-100 rounded w-2/3 skeleton-sheen" />
                  </div>
                ) : data?.verse ? (
                  <>
                    <div className="font-serif text-lg text-ink-800 leading-relaxed mb-4">“{data.verse.text}”</div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <Link href={`/bible/cuv/${data.verse.bookId}/${data.verse.chapter}`} className="inline-flex items-center py-3 -my-3 text-sm text-primary-600 font-medium hover:underline">
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
                  <Link href="/community" className="text-primary-600 whitespace-nowrap py-1.5 -my-1.5 font-medium hover:underline">{t('home.communityLink')}</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* 收边渐变必须跟着主题走：写死 #f6f7fb 在深色下会在 hero 底部留一条亮带 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32"
          style={{ backgroundImage: 'linear-gradient(to top, var(--ui-page), transparent)' }}
        />
        {/* 满屏 hero 需要一个「下面还有内容」的交代，否则首屏看着像没加载完 */}
        <div aria-hidden="true" className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center">
          <span className="w-6 h-10 rounded-full border border-white/35 flex justify-center pt-2">
            <span className="w-1 h-2.5 rounded-full bg-white/80 animate-scroll-hint" />
          </span>
        </div>
      </section>

      {/* 新手引导（仅登录且未完成时展示） */}
      <OnboardingCard />

      {/* 首页每日签到（仅登录用户可见） */}
      <HomeCheckinCard />

      {/* 统计：六格数字用 data-count 逐个跑上来，等宽数位（.num）保证过程中不左右抽动 */}
      <section className="relative py-10 md:py-14 -mt-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            data-reveal-group
            className="card-tech hair-top rounded-3xl p-6 md:p-10 shadow-card grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 md:gap-x-0 gap-y-6"
          >
            {statCards.map((s) => (
              <div key={s.label} className="text-center px-1 md:border-l md:border-ink-100 md:first:border-l-0">
                <div data-count className="num num-beam font-display text-2xl md:text-4xl font-bold">
                  {s.value}
                </div>
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
              <h2 className="font-display font-bold text-ink-900 flex items-center gap-2">
                <IconSearch className="w-5 h-5 text-primary-500" />
                {t('home.recentSearch')}
              </h2>
              {recents.length > 0 && (
                <button
                  onClick={() => {
                    try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch { /* ignore */ }
                    setRecents([]);
                  }}
                    className="text-xs text-ink-400 hover:text-rose-600 transition-colors"
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
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-11 btn-primary btn-sm px-4 text-sm">{t('home.search')}</button>
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
            <SectionHead title={t('home.featured')} href="/community" label={t('home.viewAll')} />
            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-ui-surface skeleton-sheen" />
                ))}
              </div>
            ) : (
              <div data-reveal-group className="space-y-4">
                {(data?.featured || []).map((c) => (
                  <Link key={c.id} href={`/contents/${c.id}`} data-spot className="spot block bg-white rounded-2xl p-5 shadow-soft card-hover">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
                        <Glyph glyph={c.cover} className="w-6 h-6" />
                      </div>
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
                          <span className="flex items-center gap-1">
                            <IconHeart className="w-3.5 h-3.5 shrink-0" />
                            <span className="num">{c.likeCount}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <IconChatDots className="w-3.5 h-3.5 shrink-0" />
                            <span className="num">{c.commentCount}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <IconEye className="w-3.5 h-3.5 shrink-0" />
                            <span className="num">{c.viewCount}</span>
                          </span>
                          <span>{timeAgo(c.publishedAt || c.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {!data?.featured?.length && <div className="text-ink-400">{t('home.noContent')}</div>}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-ink-900">{t('home.recentEvents')}</h2>
                <Link href="/activities" className="text-primary-600 whitespace-nowrap py-1.5 -my-1.5 text-sm hover:underline">{t('home.allEvents')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.activities || []).map((a) => (
                  <Link key={a.id} href={`/activities/${a.id}`} className="block group">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary-600 shrink-0"><Glyph glyph={a.cover} className="w-5 h-5" /></span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-800 group-hover:text-primary-600 line-clamp-1">{a.title}</div>
                        <div className="text-xs text-ink-400 num">
                          {a.city} · {countdown(a.startAt)} · {t('home.registered')} {a.confirmedCount}/{a.capacity}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {!data?.activities?.length && <div className="text-ink-400 text-sm">{t('home.noEvents')}</div>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-ink-900">{t('home.hotSongs')}</h2>
                <Link href="/songs" className="text-primary-600 whitespace-nowrap py-1.5 -my-1.5 text-sm hover:underline">{t('home.allSongs')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.songs || []).map((s) => (
                  <Link key={s.id} href={`/songs/${s.id}`} className="flex items-center justify-between gap-3 group">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-800 group-hover:text-primary-600 line-clamp-1">{s.title}</div>
                      <div className="text-xs text-ink-400">{s.author || t('home.traditionalHymn')}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-400 shrink-0">
                      <IconPlay className="w-3.5 h-3.5" />
                      <span className="num">{s.playCount}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-ink-900">{t('home.prayerWall')}</h2>
                <Link href="/prayers" className="text-primary-600 whitespace-nowrap py-1.5 -my-1.5 text-sm hover:underline">{t('home.goPray')}</Link>
              </div>
              <div className="space-y-3">
                {(data?.prayers || []).map((p) => (
                  <div key={p.id} className="text-sm">
                    <p className="text-ink-700 line-clamp-2">{p.body}</p>
                    <div className="flex items-center gap-1.5 text-xs text-ink-400 mt-1 num">
                      <IconPray className="w-3.5 h-3.5 shrink-0" />
                      {t('home.amen', { n: p.amenCount })} · {timeAgo(p.createdAt)}
                    </div>
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
          <SectionHead
            sub={t('home.groupsSub')}
            title={t('home.groups')}
            href="/groups"
            label={t('home.allGroups')}
            linkClassName="hidden sm:inline-flex"
          />
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-white skeleton-sheen" />
              ))}
            </div>
          ) : (
            <div data-reveal-group className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(data?.groups || []).map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} data-spot className="spot block card-tech rounded-2xl p-5 border border-ink-100/50">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-white flex items-center justify-center shrink-0">
                      <Glyph glyph={g.cover || '👥'} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink-900 line-clamp-1">{g.name}</h3>
                      <p className="text-xs text-ink-400">{groupCategoryLabel(g.category)} · {g.city}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-500 line-clamp-2 mb-3">{g.description}</p>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-ink-400">
                      <IconUsers className="w-3.5 h-3.5 shrink-0" />
                      {t('home.members', { n: g.memberCount })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-primary-600 font-medium">
                      {t('home.enterGroup')}
                      <IconArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              ))}
              {!data?.groups?.length && <div className="text-ink-400 col-span-full">{t('home.noGroups')}</div>}
            </div>
          )}
          <div className="sm:hidden mt-4 text-center">
            <Link href="/groups" className="group/link inline-flex items-center gap-1 text-primary-600 whitespace-nowrap py-1.5 -my-1.5 font-medium hover:underline text-sm">
              {t('home.allGroups')}
              <IconChevronRight className="w-4 h-4 transition-transform group-hover/link:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 影音敬拜 */}
      {av.length > 0 ? (
        <section className="py-10 md:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHead
              sub={t('home.mediaSub')}
              title={t('home.media')}
              href="/media"
              label={t('home.allMedia')}
              align="end"
            />
            <div data-reveal-group className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {av.map((m) => (
                <div key={m.id} data-spot className="spot bg-white rounded-2xl overflow-hidden shadow-soft card-hover border border-ink-100">
                  {m.kind === 'video' ? (
                    <Link href={`/media/${m.id}`} className="group block relative bg-black" style={{ height: 176 }}>
                      {m.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" src={m.posterUrl} alt={m.title} className="w-full h-full object-cover opacity-90 group-hover:scale-[1.03] transition-transform duration-500"  decoding="async" />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-14 h-14 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm group-hover:bg-primary-600 transition-colors">
                          <IconPlay className="w-6 h-6 translate-x-0.5" />
                        </span>
                      </span>
                      {m.durationSec ? (
                        <span className="num absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[11px]">
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
                      className="w-full relative bg-gradient-to-br from-primary-600 to-primary-800 flex flex-col items-center justify-center gap-2 group"
                      style={{ height: 176 }}
                    >
                      {/* 一枚大音符当底纹：音频卡原先是一整块纯色，空得像是没加载出来 */}
                      <IconMusicNote className="absolute -right-4 -bottom-6 w-32 h-32 text-white/10 pointer-events-none" strokeWidth={1.2} />
                      <span className="w-14 h-14 rounded-full bg-ui-surface text-primary-700 flex items-center justify-center shadow-card group-hover:scale-110 transition">
                        {player.isCurrent(m.id) && player.playing ? <IconPause className="w-6 h-6" /> : <IconPlay className="w-6 h-6 translate-x-0.5" />}
                      </span>
                      <span className="num inline-flex items-center gap-2 text-xs text-white/85">
                        <span className={`eq ${player.isCurrent(m.id) && player.playing ? 'is-playing' : ''}`} aria-hidden="true">
                          <i /><i /><i /><i />
                        </span>
                        {m.durationSec ? formatTime(m.durationSec) : t('home.tapToPlay')}
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
            <p className="eyebrow justify-center mb-2">{t('nav.catalog')}</p>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-ink-900 mb-3">{t('home.featuresTitle')}</h2>
            <p className="text-ink-500">{t('home.featuresSub')}</p>
          </div>
          <div data-reveal-group className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.filter((f) => !isOff(f.href)).map((f) => (
              <Link key={f.href} href={f.href} data-spot className="spot glow-edge group card-tech rounded-3xl p-7">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} text-white flex items-center justify-center mb-5 shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:shadow-glow`}>
                  <f.Icon className="w-7 h-7" strokeWidth={1.6} />
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2">{t(`home.feat.${f.tkey}.title`)}</h3>
                <p className="text-ink-500 text-sm mb-4">{t(`home.feat.${f.tkey}.desc`)}</p>
                <span className="text-primary-600 font-semibold text-sm flex items-center gap-1">
                  {t('home.experience')}
                  <IconArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 rounded-3xl overflow-hidden shadow-card-hover">
            {/* 右上角这团 white/10 的雾把带子最亮的一档又提亮了 10%：text-white/85 压在
                primary-600 上本来是 4.94，压在这团雾上只剩 4.11。雾减到 /5、副文案提到 /90。 */}
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
            <div className="relative px-8 py-14 md:px-16 text-center">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">{t('home.ctaTitle')}</h2>
              <p className="text-white/90 mb-8">{t('home.ctaSub')}</p>
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
