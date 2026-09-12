'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePlayer } from '@/lib/player';
import { audioTypeMeta, VOCAL_WANTED_HINT, vocalListenTarget } from '@/lib/audioType';
import RecentPlays from '@/components/RecentPlays';
import SubmitSongModal from '@/components/SubmitSongModal';
import { IconMusicNote, IconPlay, IconPause, IconSearch, IconPlus, IconMicrophone, IconEye, IconStar, IconSparkles, IconUpload } from '@/components/icons';
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

function SongCard({ s, onRequestVocal }: { s: SongItem; onRequestVocal?: (title: string) => void }) {
  const player = usePlayer();
  const active = player.isCurrent(s.id) && player.playing;
  const meta = audioTypeMeta(s.audioType);
  const listen = vocalListenTarget(s);
  return (
    <Link
      key={s.id}
      href={`/songs/${s.id}`}
      className="group bg-white rounded-2xl p-4 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 border border-ink-100 hover:border-gold-200 flex items-center gap-4"
    >
      <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-700 group-hover:from-gold-400 group-hover:to-gold-500 group-hover:text-white transition-all flex-shrink-0">
        <IconMusicNote className="w-6 h-6" strokeWidth={1.7} />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold-400/0 group-hover:bg-gold-300/70 transition-colors blur-[1px]" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-ink-900 group-hover:text-gold-600 transition-colors truncate">{s.title}</h3>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-ink-500 truncate">{s.author}</span>
          {s.category && (
            <>
              <span className="w-1 h-1 rounded-full bg-ink-300" />
              <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{s.category}</span>
            </>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${meta.tone}`}
            title={s.audioCredit ? `${meta.hint} · ${s.audioCredit}` : meta.hint}
          >
            {meta.label}
          </span>
        </div>
        {s.audioType !== 'vocal' && (
          <span className="flex items-center gap-2 mt-1 text-xs text-gold-700 min-w-0">
            {onRequestVocal && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestVocal(s.title);
                }}
                title={VOCAL_WANTED_HINT}
                className="hover:underline truncate py-1.5 -my-1.5"
              >
                🎤 我来投稿
              </button>
            )}
            {/* 不能用 <a>:外层已经是 <Link> 渲染的 <a>,嵌套 a 会造成非法 HTML */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(listen.url, '_blank', 'noopener,noreferrer');
              }}
              title={
                listen.verified
                  ? `管理员已核实是人声演唱（${listen.source}）`
                  : `去${listen.source}找这首的人声版`
              }
              className="hover:underline truncate py-1.5 -my-1.5"
            >
              🎧 {listen.verified ? '在线听人声版' : '找人声版'}
            </button>
          </span>
        )}
      </div>
      {s.audioUrl ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            player.playTrack({
              id: s.id, title: s.title, artist: s.author || '圣约社区',
              url: s.audioUrl, durationSec: s.durationSec,
            });
          }}
          title={active ? '暂停' : '在线试听'}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition ${
            active ? 'bg-gold-500 text-white' : 'bg-gold-100 text-gold-700 hover:bg-gold-400 hover:text-white'
          }`}
        >
          {active ? <IconPause className="w-4 h-4" /> : <IconPlay className="w-4 h-4 ml-0.5" />}
        </button>
      ) : null}
      <div className="flex items-center gap-1.5 text-ink-400 text-sm flex-shrink-0">
        <IconEye className="w-4 h-4" />
        {s.playCount}
      </div>
    </Link>
  );
}

export default function SongsPage() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTitle, setSubmitTitle] = useState('');
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [tab, setTab] = useState<FilterTab>('all');

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

  const favoritesPath = tab === 'favorites' ? '/songs/favorites' : null;
  const {
    data: favData,
    loading: favLoading,
    error: favError,
  } = useApi<{ items: SongItem[] }>(favoritesPath, [tab]);

  const cats = useMemo(
    () => [{ name: '全部', count: data?.total ?? 0 }, ...(data?.categories ?? [])],
    [data]
  );

  const favItems = favData?.items ?? [];
  // 带人声的曲目数,用于"只要人声"这个 tab 的角标
  const vocalCount = data?.vocalCount ?? 0;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold-700 via-gold-600 to-gold-800" />
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 mb-6">
            <IconMusicNote className="w-4 h-4 text-white" strokeWidth={1.7} />
            <span className="text-white font-medium">
              {tab === 'favorites'
                ? `${favItems.length} 首收藏`
                : tab === 'vocal'
                  ? `${data?.total ?? '—'} 首有人声演唱`
                  : `${data?.total ?? '—'} 首诗歌 · ${vocalCount} 首有人声`}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-4 md:mb-6">赞美诗歌</h1>
          <p className="text-base sm:text-xl text-white/85 max-w-2xl mx-auto mb-6 md:mb-8 font-serif italic">
            "我要向耶和华歌唱，称颂他的大名。" —— 诗篇 66:2
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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="搜索诗歌、作者或标签..."
                  className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white/95 backdrop-blur-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-gold-500/30 shadow-xl text-base"
                />
              </form>
              <button
                onClick={() => openSubmit()}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 text-white font-medium text-sm transition-colors"
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

        {/* 筛选 tab：全部 / 只要人声 / 我的收藏 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                tab === t.id
                  ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-white shadow-lg shadow-gold-500/30'
                  : 'bg-white text-ink-600 hover:bg-ink-50 border border-ink-200 hover:border-gold-300'
              }`}
            >
              {t.label}
              {t.id === 'vocal' && vocalCount > 0 && (
                <span className={`ml-1.5 text-xs ${tab === t.id ? 'text-white/70' : 'text-ink-400'}`}>{vocalCount}</span>
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
                    className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                      active
                        ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-white shadow-lg shadow-gold-500/30'
                        : 'bg-white text-ink-600 hover:bg-ink-50 border border-ink-200 hover:border-gold-300'
                    }`}
                  >
                    {c.name}
                    <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{c.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 bg-white rounded-full p-1 shadow-soft border border-ink-100 self-start">
              <button
                onClick={() => setSort('hot')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  sort === 'hot' ? 'bg-gold-500 text-white' : 'text-ink-500 hover:text-gold-600'
                }`}
              >
                热门
              </button>
              <button
                onClick={() => setSort('new')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  sort === 'new' ? 'bg-gold-500 text-white' : 'text-ink-500 hover:text-gold-600'
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
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">
              {tab === 'vocal' ? '站内还没有人声演唱的版本' : q ? <>站内没有找到「{q}」</> : '没有找到相关诗歌'}
            </h3>
            <p className="text-ink-500 mb-6">
              {tab === 'vocal'
                ? '平台的音频目前以伴奏为主，真人演唱版本正在向各教会与诗班征集。有录音欢迎投稿，管理员核实后就会出现在这里'
                : '试试更换关键词或分类筛选；也可以去站外找带唱的版本，或直接投稿收录'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={`https://www.baidu.com/s?wd=${encodeURIComponent(`${q || ''} 歌词 原唱`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-block px-5 py-2.5 text-sm"
              >
                <IconSearch className="w-4 h-4" strokeWidth={2} />
                去站外搜「{q || '带唱的版本'}」
              </a>
              <button
                onClick={() => openSubmit()}
                className="btn-ghost inline-block px-5 py-2.5 text-sm"
              >
                <IconMicrophone className="w-4 h-4" strokeWidth={2} />
                投稿人声版本
              </button>
            </div>
            {tab === 'all' && !q && (
              <p className="text-ink-400 text-xs mt-4">搜索不到想要的诗歌？投稿后经审核即可被大家搜到</p>
            )}
          </div>
        ) : isList ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {data?.items.map((s) => (
              <SongCard key={s.id} s={s} onRequestVocal={openSubmit} />
            ))}
          </div>
        ) : null}

        {isList && !loading && data && data.total > data.items.length && (
          <p className="text-center text-ink-400 text-sm mt-8">共 {data.total} 首，已显示前 {data.items.length} 首</p>
        )}
        {isList && !loading && data && data.items.length > 0 && (
          <p className="text-center text-ink-400 text-xs mt-4">最后更新：{formatDate(data.items[0]?.createdAt)}</p>
        )}

        {/* 我的收藏模式 */}
        {tab === 'favorites' && (
          <>
            {favLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SongCardSkeleton key={i} />
                ))}
              </div>
            )}
            {favError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl p-4 text-sm">
                加载失败：{favError}
                {favError.includes('401') || favError.includes('登录') ? (
                  <Link href="/login" className="underline ml-1">去登录</Link>
                ) : null}
              </div>
            )}
            {!favLoading && !favError && favItems.length === 0 && (
              <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-600">
                  <IconStar className="w-8 h-8" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2">还没有收藏的诗歌</h3>
                <p className="text-ink-500 mb-4">在诗歌详情页点击收藏，让喜爱的诗歌常伴左右</p>
                <Link href="/songs" className="btn-primary inline-block px-6 py-2 text-sm">去逛逛诗歌</Link>
              </div>
            )}
            {!favLoading && !favError && favItems.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {favItems.map((s) => (
                  <SongCard key={s.id} s={s} onRequestVocal={openSubmit} />
                ))}
              </div>
            )}
          </>
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
