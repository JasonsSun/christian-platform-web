'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { qs, apiGet } from '@/lib/api';
import { formatDate } from '@/lib/format';
import RecentPlays from '@/components/RecentPlays';
import { Empty } from '@/components/ui';
import dynamic from 'next/dynamic';

// 投稿弹窗点击才出现，按需加载
const SubmitSongModal = dynamic(() => import('@/components/SubmitSongModal'), { ssr: false }) as unknown as typeof import('@/components/SubmitSongModal').default;
import SongCard from '@/components/SongCard';
import { IconMusicNote, IconSearch, IconMicrophone, IconStar, IconChevronRight } from '@/components/icons';
import type { SongItem } from '@/lib/types';
import { SongCardSkeleton } from '@/components/Skeleton';

type SongsResp = {
  items: SongItem[];
  total: number;
  vocalCount: number;
  categories: { name: string; count: number }[];
};

const FILTER_TABS = [
  { id: 'all', label: '全部诗歌' },
  { id: 'vocal', label: '只要人声' },
  { id: 'favorites', label: '我的收藏' },
] as const;
type FilterTab = (typeof FILTER_TABS)[number]['id'];

export default function SongsPage() {
  const { user, loading: authLoading } = useAuth();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTitle, setSubmitTitle] = useState('');
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [tab, setTab] = useState<FilterTab>('all');

  // ?tab= 直链：⌘K 的「我的诗歌收藏」和未登录时那扇门的回跳都靠它落到对应页签。
  // 跟 /friends 同一套写法（挂载后读一次 location.search），不在 useState 初值里读 ——
  // 服务端渲染拿不到 query，写进初值会让首屏和注水后的 DOM 对不上。
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'all' || t === 'vocal' || t === 'favorites') setTab(t);
  }, []);

  /** 打开投稿弹窗；带 title 时预填标题(用于"这首没人声版，我来投稿") */
  const openSubmit = (t?: string) => {
    setSubmitTitle(t || '');
    setShowSubmit(true);
  };

  // 列表 tab(all / vocal)走后端筛选;favorites 走另一个接口
  const isList = tab !== 'favorites';
  const path =
    '/songs' +
    qs({
      q: q || undefined,
      category: category || undefined,
      audioType: tab === 'vocal' ? 'vocal' : undefined,
      sort,
      page: 1,
      pageSize: 24,
    });
  const { data, loading, error } = useApi<SongsResp>(isList ? path : null, [q, category, sort, tab]);

  // 未登录不去要 /songs/favorites：这一趟必然 401，红色的「加载失败」会把「你还没登录」
  // 说成站点坏了（下面改成立在原地的登录门）。
  const favoritesPath = tab === 'favorites' && user ? '/songs/favorites' : null;
  const {
    data: favData,
    loading: favLoading,
    error: favError,
  } = useApi<{ items: SongItem[] }>(favoritesPath, [tab]);

  // 全库诗歌数：服务端算的 categories / vocalCount 都是不带筛选的口径，「全部」这颗胶囊
  // 和页眉那句「N 首诗歌 · M 首有人声」得跟它们同源。原先两处都用 data.total ——
  // 那是当前搜索结果，搜一个词之后「全部」变成命中数，旁边各分类还是全库数，
  // 极端时甚至出现「3 首诗歌 · 21 首有人声」。
  const libTotal = data ? (data.categories ?? []).reduce((n, c) => n + c.count, 0) : null;

  const cats = useMemo(
    () => [{ name: '全部', count: libTotal ?? 0 }, ...(data?.categories ?? [])],
    [data, libTotal]
  );

  const favItems = favData?.items ?? [];
  // 带人声的曲目数,用于"只要人声"这个 tab 的角标
  const vocalCount = data?.vocalCount ?? 0;

  /* 站内搜不到 -> 站外找资源。走后端抓取，避免浏览器直连搜索引擎的跨域限制 */
  type ExternalItem = { title: string; url: string; snippet: string };
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalItems, setExternalItems] = useState<ExternalItem[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState('');

  const searchExternal = async () => {
    const keyword = q.trim();
    if (!keyword) return;
    setExternalOpen(true);
    setExternalLoading(true);
    setExternalError('');
    try {
      const d = await apiGet<{ items: ExternalItem[] }>(
        `/songs/external-search?q=${encodeURIComponent(keyword)}`
      );
      setExternalItems(d.items || []);
    } catch (e: any) {
      setExternalItems([]);
      setExternalError(e?.message || '站外搜索失败，请稍后重试');
    } finally {
      setExternalLoading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* 原先整块是深金渐变，下面又压了一条亮金歌单带，两层金叠在一起发闷。
            hero 换成全站深蓝科技底，金只留作强调色（歌单带、选中态、聚焦环）。 */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900" />
        <div className="absolute inset-0 mesh-bg opacity-70" />
        <div className="absolute inset-0 dot-grid opacity-25" />
        <div className="absolute inset-0 overflow-hidden">
          {[
            { top: '15%', left: '10%', size: 48, delay: '0s', duration: '6s' },
            { top: '25%', left: '80%', size: 32, delay: '1s', duration: '8s' },
            { top: '55%', left: '20%', size: 40, delay: '2s', duration: '5s' },
            { top: '65%', left: '70%', size: 56, delay: '0.5s', duration: '7s' },
          ].map((note, i) => (
            <div
              key={i}
              className="absolute text-white/10 animate-float hidden md:block"
              style={{ top: note.top, left: note.left, animationDelay: note.delay, animationDuration: note.duration }}
            >
              <IconMusicNote className="w-12 h-12" style={{ width: `${note.size}px`, height: `${note.size}px` }} strokeWidth={1.2} />
            </div>
          ))}
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-16 md:pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink-950/20 backdrop-blur-sm border border-white/20 mb-6">
            <IconMusicNote className="w-4 h-4 text-white" strokeWidth={1.7} />
            <span className="num text-white font-medium">
              {tab === 'favorites'
                ? // 匿名没有「我的」可数，摆一个「0 首收藏」是假数字；登录态还没落定时也一样，
                  // 先给标签，等真数据到了再报数。
                  (!authLoading && !user
                    ? '登录后查看收藏'
                    : favData
                      ? `${favItems.length} 首收藏`
                      : '我的收藏')
                : tab === 'vocal'
                  ? // 「只要人声」页签上的 0 由下面的空态卡片负责说（它还带着投稿入口），
                    // 页眉这行是站名一样的品牌位，摆一个「0 首有人声演唱」读起来像坏了。
                    (vocalCount ? `${vocalCount} 首有人声演唱` : '人声演唱版本')
                  : // 人声版本站内还没上架（库里 14 首全是纯音乐），把「0 首有人声」摆在页眉
                    // 读起来像出了故障。数为 0 的那半句直接不报，只留总量。
                    (vocalCount
                      ? `${libTotal ?? '—'} 首诗歌 · ${vocalCount} 首有人声`
                      : `${libTotal ?? '—'} 首诗歌`)}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-4 md:mb-6 text-glow">赞美诗歌</h1>
          <p className="text-base sm:text-xl text-white/95 max-w-2xl mx-auto mb-6 md:mb-8 font-serif italic">
            “我要向耶和华歌唱，称颂他的大名。” —— 诗篇 66:2
          </p>

          {isList && (
            <div className="max-w-xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setQ(input);
                }}
                className="relative"
              >
                <IconSearch className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" strokeWidth={2} />
                <input
                  aria-label="搜索诗歌"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="搜索诗歌、作者或标签..."
                  className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white/95 backdrop-blur-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-gold-500/30 shadow-xl text-base"
                />
              </form>
              <button
                onClick={() => openSubmit()}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink-950/20 hover:bg-ink-950/30 backdrop-blur-sm border border-white/25 text-white font-medium text-sm transition-colors"
              >
                <IconMicrophone className="w-4 h-4" strokeWidth={2} />
                投稿人声版本
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 继续收听：本地记录的最近播放 */}
        {isList && <RecentPlays />}

        {/* 主题歌单入口 */}
        <Link
          href="/songs/collections"
          data-spot
          className="group spot mb-6 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 p-4 shadow-glow text-ink-950 hover:opacity-95 transition-opacity"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-white/20 text-ink-950/85 flex items-center justify-center flex-shrink-0">
              <IconMusicNote className="w-5 h-5" strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-bold">主题歌单</p>
              <p className="text-xs text-ink-950/80 truncate">按场景找歌 · 灵修 · 安慰 · 敬拜 · 救恩 · 节期…</p>
            </div>
          </div>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-sm font-semibold">
            去逛逛
            <IconChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {/* 筛选 tab：全部 / 只要人声 / 我的收藏 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`inline-flex items-center min-h-[2.75rem] px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                tab === t.id
                  ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-ink-950 shadow-lg shadow-gold-500/30'
                  : 'bg-white text-ink-600 hover:bg-ink-50 border border-ink-200 hover:border-gold-300'
              }`}
            >
              {t.label}
              {t.id === 'vocal' && vocalCount > 0 && (
                <span className={`num ml-1.5 text-xs ${tab === t.id ? 'text-ink-950/90' : 'text-ink-400'}`}>{vocalCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* 仅列表模式显示 分类 + 排序 */}
        {isList && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => {
                const active = (c.name === '全部' ? '' : c.name) === category;
                return (
                  <button
                    key={c.name}
                    onClick={() => setCategory(c.name === '全部' ? '' : c.name)}
                    aria-pressed={active}
                    className={`inline-flex items-center min-h-[2.75rem] px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                      active
                        ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-ink-950 shadow-lg shadow-gold-500/30'
                        : 'bg-white text-ink-600 hover:bg-ink-50 border border-ink-200 hover:border-gold-300'
                    }`}
                  >
                    {c.name}
                    <span className={`num ml-1.5 text-xs ${active ? 'text-ink-950/90' : 'text-ink-400'}`}>{c.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 bg-white rounded-full p-1 shadow-soft border border-ink-100 self-start">
              <button
                onClick={() => setSort('hot')}
                aria-pressed={sort === 'hot'}
                className={`min-h-[2.75rem] md:min-h-[2.25rem] px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  sort === 'hot' ? 'bg-gold-500 text-ink-950' : 'text-ink-500 hover:text-gold-600'
                }`}
              >
                热门
              </button>
              <button
                onClick={() => setSort('new')}
                aria-pressed={sort === 'new'}
                className={`min-h-[2.75rem] md:min-h-[2.25rem] px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  sort === 'new' ? 'bg-gold-500 text-ink-950' : 'text-ink-500 hover:text-gold-600'
                }`}
              >
                最新
              </button>
            </div>
          </div>
        )}

        {/* 诗歌列表模式(全部 / 只要人声) */}
        {isList && error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {isList && loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <SongCardSkeleton key={i} />
            ))}
          </div>
        ) : isList && data && data.items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 shadow-soft border border-ink-100 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-600">
              {tab === 'vocal' ? <IconMicrophone className="w-8 h-8" strokeWidth={1.5} /> : <IconMusicNote className="w-8 h-8" strokeWidth={1.5} />}
            </div>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-2">
              {tab === 'vocal' ? '站内还没有人声演唱的版本' : q ? <>站内没有找到「{q}」</> : '没有找到相关诗歌'}
            </h2>
            <p className="text-ink-500 mb-6">
              {tab === 'vocal'
                ? '平台的音频目前以伴奏为主，真人演唱版本正在向各教会与诗班征集。有录音欢迎投稿，管理员核实后就会出现在这里'
                : '试试更换关键词或分类筛选；也可以去站外找带唱的版本，或直接投稿收录'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={searchExternal}
                disabled={!q || externalLoading}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <IconSearch className="w-4 h-4" strokeWidth={2} />
                {externalLoading ? '站外搜索中…' : `在站外搜「${q || '关键词'}」`}
              </button>
              <button
                onClick={() => openSubmit()}
                className="btn-ghost inline-block px-5 py-2.5 text-sm"
              >
                <IconMicrophone className="w-4 h-4" strokeWidth={2} />
                投稿人声版本
              </button>
            </div>

            {/* 站外搜索结果：站内直接展示，免去跳转搜索引擎 */}
            {externalOpen && (
              <div className="mt-6 text-left">
                {externalLoading ? (
                  <p className="text-sm text-ink-500 text-center py-4">正在搜索站外资源…</p>
                ) : externalError ? (
                  <p className="text-sm text-rose-600 text-center py-4">{externalError}</p>
                ) : externalItems.length === 0 ? (
                  <p className="text-sm text-ink-500 text-center py-4">
                    站外也没有找到相关结果，换个关键词再试试，或直接投稿收录。
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-ink-400">以下为站外结果，版权与内容由原站点负责</p>
                      <a
                        href={`https://www.baidu.com/s?wd=${encodeURIComponent(`${q} 歌词 原唱`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:text-primary-700"
                      >
                        用搜索引擎打开 →
                      </a>
                    </div>
                    <div className="space-y-2">
                      {externalItems.map((it) => (
                        <a
                          key={it.url}
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-ink-200 p-3 hover:border-primary-300 hover:bg-primary-50/40 transition"
                        >
                          <div className="text-sm font-medium text-primary-700 line-clamp-2">{it.title}</div>
                          {it.snippet && (
                            <div className="text-xs text-ink-500 mt-1 line-clamp-2 leading-relaxed">{it.snippet}</div>
                          )}
                          <div className="text-[11px] text-ink-400 mt-1.5 truncate">{it.url}</div>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'all' && !q && (
              <p className="text-ink-400 text-xs mt-4">搜索不到想要的诗歌？投稿后经审核即可被大家搜到</p>
            )}
          </div>
        ) : isList ? (
          <div data-reveal-group className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {data?.items.map((s) => (
              <SongCard key={s.id} s={s} onRequestVocal={openSubmit} />
            ))}
          </div>
        ) : null}

        {isList && !loading && data && data.total > data.items.length && (
          <p className="num text-center text-ink-400 text-sm mt-8">共 {data.total} 首，已显示前 {data.items.length} 首</p>
        )}
        {isList && !loading && data && data.items.length > 0 && (
          <p className="num text-center text-ink-400 text-xs mt-4">最后更新：{formatDate(data.items[0]?.createdAt)}</p>
        )}

        {/* 我的收藏模式 */}
        {tab === 'favorites' && !authLoading && !user ? (
          <Empty label="登录后即可查看我的收藏" hint="收藏挂在账号下，换设备、换个浏览器登录都能带过去。">
            <Link className="btn-primary" href={`/login?next=${encodeURIComponent('/songs?tab=favorites')}`}>
              去登录
            </Link>
            <button type="button" className="btn-secondary" onClick={() => setTab('all')}>
              先逛逛诗歌
            </button>
          </Empty>
        ) : (
          tab === 'favorites' && (
            <>
              {favLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SongCardSkeleton key={i} />
                  ))}
                </div>
              )}
              {favError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm">
                  加载失败：{favError}
                  {favError.includes('401') || favError.includes('登录') ? (
                    <Link href="/login?next=/songs" className="underline ml-1">去登录</Link>
                  ) : null}
                </div>
              )}
              {!favLoading && !favError && favItems.length === 0 && (
                <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-600">
                    <IconStar className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                  <h2 className="font-display text-xl font-bold text-ink-900 mb-2">还没有收藏的诗歌</h2>
                  <p className="text-ink-500 mb-4">在诗歌详情页点击收藏，让喜爱的诗歌常伴左右</p>
                  <Link href="/songs" className="btn-primary btn-sm inline-block px-6 text-sm">去逛逛诗歌</Link>
                </div>
              )}
              {!favLoading && !favError && favItems.length > 0 && (
                <div data-reveal-group className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {favItems.map((s) => (
                    <SongCard key={s.id} s={s} onRequestVocal={openSubmit} />
                  ))}
                </div>
              )}
            </>
          )
        )}
      </div>

      {showSubmit && (
        <SubmitSongModal
          presetTitle={submitTitle}
          onClose={() => setShowSubmit(false)}
          onDone={() => {
            setShowSubmit(false);
            setSubmitTitle('');
            setQ('');
            setInput('');
            setCategory('');
          }}
        />
      )}
    </div>
  );
}
