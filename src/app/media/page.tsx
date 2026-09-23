'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatSize } from '@/lib/format';
import { usePlayer, formatTime } from '@/lib/player';
import RecentPlays from '@/components/RecentPlays';
import { Empty } from '@/components/ui';
import {
  IconMusicNote,
  IconDocument,
  IconFilm,
  IconImage,
  IconFolder,
  IconPlay,
  IconPause,
  IconUpload,
} from '@/components/icons';
import type { MediaItem } from '@/lib/types';

/** 首页与每次「加载更多」的条数：48 在 4 列布局下刚好铺满 12 行 */
const PAGE_SIZE = 48;

const KINDS = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'audio', label: '音乐' },
  { key: 'video', label: '视频' },
  { key: 'score', label: '曲谱' },
  { key: 'doc', label: '资料' },
];

/** 来源:全部 / 上传 / 直播回放 */
const SOURCES = [
  { key: '', label: '全部' },
  { key: 'upload', label: '用户上传' },
  { key: 'live', label: '直播回放' },
];

const KIND_ICON: Record<string, typeof IconMusicNote> = {
  score: IconMusicNote,
  doc: IconDocument,
  audio: IconMusicNote,
  video: IconFilm,
  image: IconImage,
};

function TypeIcon({ kind, className = 'w-12 h-12' }: { kind: string; className?: string }) {
  const Cmp = KIND_ICON[kind] || IconFolder;
  return <Cmp className={className} strokeWidth={1.3} />;
}

export default function MediaPage() {
  const { user } = useAuth();
  const player = usePlayer();
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  // 搜索框防抖：q 进了 deps 就是每敲一个字发一个请求。过期响应 useApi 已经会丢弃，
  // 不再「后发的先回」把列表停在打了一半的关键词上，但每个字仍是一次真实往返
  // （挂载后一律 noCache），350ms 合并一次就够（与 /devotions 同一做法）
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const query = `kind=${kind}&source=${source}&q=${encodeURIComponent(q)}`;
  const { data, loading, error, reload } = useApi<{
    items: MediaItem[];
    total: number;
    byKind: { kind: string; label: string; c: number }[];
    bySource?: { source: string; c: number }[];
  }>(`/media?${query}&pageSize=${PAGE_SIZE}`, [kind, source, q]);

  // 追加的后续页：单独存，筛选一变就清空，否则会出现「全部」里混着「视频」的条目
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setPage(1);
    setMoreError(null);
  }, [kind, source, q]);

  // 按 id 去重：第一页与追加页在两次请求之间有新增数据时会重叠
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: MediaItem[] = [];
    for (const m of [...(data?.items || []), ...extra]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [data, extra]);

  const total = data?.total ?? 0;
  const hasMore = items.length > 0 && items.length < total;
  // 换类型/来源/关键词时 useApi 会留着旧 data 只把 loading 抬起来。
  // 整块网格跟着 loading 拆掉重装就是「整页空白 → 弹回来」，
  // 后台表格用 TableShell 的 busy 压暗解决，这里同一个口径。
  const busy = loading && items.length > 0;

  async function loadMore() {
    setMoreLoading(true);
    setMoreError(null);
    try {
      const r = await apiGet<{ items: MediaItem[] }>(`/media?${query}&page=${page + 1}&pageSize=${PAGE_SIZE}`);
      setExtra((cur) => [...cur, ...(r.items || [])]);
      setPage((p) => p + 1);
    } catch (e: any) {
      setMoreError(e?.message || '加载更多失败，请稍后重试');
    } finally {
      setMoreLoading(false);
    }
  }

  const countOf = (k: string) => data?.byKind?.find((b) => b.kind === k)?.c ?? 0;
  const countSource = (s: string) => data?.bySource?.find((b) => b.source === s)?.c ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">媒体与资料</h1>
          <p className="text-ink-500 mt-1 text-sm">图片、音乐、视频、曲谱与资料，全部经审核后展示</p>
        </div>
        {user ? (
          <Link href="/upload" className="btn-primary"><IconUpload className="w-4 h-4" strokeWidth={1.9} /> 上传文件</Link>
        ) : (
          <Link href="/login" className="btn-secondary">登录后上传</Link>
        )}
      </div>

      <RecentPlays />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {KINDS.map((k) => (
          <button
            key={k.key || 'all'}
            onClick={() => setKind(k.key)}
            aria-pressed={kind === k.key}
            className={`inline-flex items-center min-h-[2.75rem] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              kind === k.key ? 'bg-primary-600 text-white shadow-card' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {k.label}
            <span className="num ml-1 text-xs opacity-70">{k.key ? countOf(k.key) : data?.total ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-ink-400 mr-1">来源</span>
        {SOURCES.map((s) => (
          <button
            key={s.key || 'src-all'}
            onClick={() => setSource(s.key)}
            aria-pressed={source === s.key}
            className={`inline-flex items-center min-h-[2.75rem] px-4 py-1.5 rounded-full text-xs font-medium transition border ${
              source === s.key
                ? 'bg-gold-500/15 border-gold-500 text-gold-800'
                : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
            }`}
          >
            {s.label}
            <span className="num ml-1 opacity-90">{s.key ? countSource(s.key) : ''}</span>
          </button>
        ))}
        <input
          aria-label="搜索媒体标题或文件名"
          className="input-styled flex-1 min-w-[160px]"
          placeholder="搜索标题 / 文件名"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {items.filter((m) => m.kind === 'audio').length > 0 ? (
          <button
            onClick={() => player.playTracks(
              items.filter((m) => m.kind === 'audio').map((m) => ({
                id: m.id, title: m.title, artist: m.owner || '圣约社区', url: m.url,
                poster: m.posterUrl, durationSec: m.durationSec,
              })), 0)}
            className="btn-gold whitespace-nowrap"
          >
            <IconPlay className="w-4 h-4" strokeWidth={2} /> 播放全部音乐
          </button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="py-20 text-center text-ink-400">加载中…</div>
      ) : error && items.length === 0 ? (
        <div className="py-20 text-center text-rose-600">{error} <button onClick={reload} className="underline ml-2">重试</button></div>
      ) : items.length === 0 ? (
        kind || source || q ? (
          <Empty label="没有符合当前筛选的媒体" hint="换一个类型或关键词，或者把筛选清掉看看全部。">
            <button
              onClick={() => { setKind(''); setSource(''); setInput(''); setQ(''); }}
              className="btn-secondary btn-sm min-h-11 lg:min-h-0"
            >
              清除筛选
            </button>
          </Empty>
        ) : (
          <Empty
            label="暂无已审核通过的媒体"
            hint="弟兄姐妹上传的图片、诗歌与讲稿，要经同工审核通过后才对外展示。"
          >
            <Link href="/upload" className="btn-secondary btn-sm min-h-11 lg:min-h-0">
              上传文件
            </Link>
          </Empty>
        )
      ) : (
        <div data-reveal-group className={`grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 transition-opacity duration-200 ${busy ? 'opacity-60' : 'opacity-100'}`}>
          {items.map((m) => (
            <div key={m.id} className="glass rounded-2xl overflow-hidden shadow-soft card-hover flex flex-col">
              <div className="relative bg-ink-100 flex items-center justify-center" style={{ height: 172 }}>
                {m.kind === 'video' ? (
                  <Link href={`/media/${m.id}`} className="w-full h-full block" aria-label={`播放 ${m.title}`}>
                    <video
                      src={m.url}
                      poster={m.posterUrl || undefined}
                      preload="metadata"
                      muted
                      className="w-full h-full object-cover bg-black"
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm">
                        <IconPlay className="w-5 h-5" strokeWidth={1.8} />
                      </span>
                    </span>
                  </Link>
                ) : m.kind === 'audio' ? (
                  <button
                    type="button"
                    onClick={() => player.playTrack({
                      id: m.id, title: m.title, artist: m.owner || '圣约社区', url: m.url,
                      poster: m.posterUrl, durationSec: m.durationSec,
                    })}
                    className="relative w-full h-full bg-gradient-to-br from-primary-600 to-primary-800 flex flex-col items-center justify-center gap-2.5 group"
                    title="在线播放"
                    aria-label={`播放 ${m.title}`}
                  >
                    {/* 音频没有封面，原先是一整块纯灰，看起来像没加载出来；
                        这里和首页的音频卡共用同一套底纹 + 声波条 */}
                    <IconMusicNote className="absolute -right-4 -bottom-6 w-32 h-32 text-white/10 pointer-events-none" strokeWidth={1.2} />
                    <span className="relative w-14 h-14 rounded-full bg-white/95 text-primary-900 flex items-center justify-center shadow-card transition group-hover:scale-110">
                      {player.isCurrent(m.id) && player.playing ? (
                        <IconPause className="w-6 h-6" strokeWidth={1.8} />
                      ) : (
                        <IconPlay className="w-6 h-6 translate-x-0.5" strokeWidth={1.8} />
                      )}
                    </span>
                    <span className="relative num inline-flex items-center gap-2 text-xs text-white/85">
                      <span className={`eq ${player.isCurrent(m.id) && player.playing ? 'is-playing' : ''}`} aria-hidden="true">
                        <i /><i /><i /><i />
                      </span>
                      {/* 时长由卡片右下角那枚 chip 统一给出（视频/音频同一个位置），
                          这里再印一遍会出现两个 0:27；只有没有时长可显示时才留一句提示 */}
                      {m.durationSec ? null : '点击播放'}
                    </span>
                  </button>
                ) : m.kind === 'image' ? (
                  <Link href={`/media/${m.id}`} className="w-full h-full block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async" src={m.url} alt={m.title} className="w-full h-full object-cover" />
                  </Link>
                ) : (
                  <Link href={`/media/${m.id}`} className="w-full h-full flex flex-col items-center justify-center" aria-label={`查看 ${m.title}`}>
                    <TypeIcon kind={m.kind} className="w-12 h-12 mb-2 text-ink-500" />
                    <div className="text-xs text-ink-500 uppercase">{m.extension}</div>
                  </Link>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">
                  {m.kindLabel}
                </span>
                {m.source === 'live' && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-600/90 text-white text-[11px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    直播回放
                  </span>
                )}
                {m.durationSec ? (
                  <span className="num absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/65 text-white text-[11px]">
                    {formatTime(m.durationSec)}
                  </span>
                ) : null}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="font-medium text-ink-900 line-clamp-1" title={m.title}>{m.title}</div>
                <div className="text-xs text-ink-400 mt-1 line-clamp-1">{m.fileName}</div>
                <div className="num flex items-center justify-between mt-3 text-xs text-ink-500">
                  <span>{formatSize(m.sizeBytes)}</span>
                  <span>{formatDate(m.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-ink-400">{m.owner || '匿名'}</span>
                  <a href={m.url} download={m.fileName} aria-label={`下载 ${m.fileName || m.title}`} className="inline-flex items-center min-h-[2.75rem] px-2 text-xs text-primary-600 hover:underline">下载</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && !loading ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          {/* 列表留着旧结果，失败就得在这儿说：不报出来会变成「筛了半天没反应」 */}
          {error ? (
            <p role="alert" className="text-sm text-rose-600">
              {error} <button onClick={reload} className="underline ml-1">重试</button>
            </p>
          ) : hasMore ? (
            <button onClick={loadMore} disabled={moreLoading} className="btn-secondary">
              {moreLoading ? '加载中…' : `加载更多（还有 ${Math.max(0, total - items.length)} 项）`}
            </button>
          ) : (
            <p className="text-xs text-ink-400">已显示全部 {total} 项</p>
          )}
          {moreError && (
            <p role="alert" className="text-xs text-rose-600">
              {moreError} <button onClick={loadMore} className="underline ml-1">重试</button>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
