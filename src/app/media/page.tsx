'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDate, formatSize } from '@/lib/format';
import { usePlayer, formatTime } from '@/lib/player';
import RecentPlays from '@/components/RecentPlays';
import type { MediaItem } from '@/lib/types';

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

function TypeIcon({ kind }: { kind: string }) {
  const map: Record<string, string> = { score: '🎼', doc: '📄', audio: '🎵', video: '🎬', image: '🖼️' };
  return <span>{map[kind] || '📁'}</span>;
}

export default function MediaPage() {
  const { user } = useAuth();
  const player = usePlayer();
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: MediaItem[];
    total: number;
    byKind: { kind: string; label: string; c: number }[];
    bySource?: { source: string; c: number }[];
  }>(`/media?kind=${kind}&source=${source}&q=${encodeURIComponent(q)}&pageSize=48`, [kind, source, q]);

  const items = data?.items || [];
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
          <Link href="/upload" className="btn-primary">＋ 上传文件</Link>
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
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              kind === k.key ? 'bg-primary-600 text-white shadow-card' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {k.label}
            <span className="ml-1 text-xs opacity-70">{k.key ? countOf(k.key) : data?.total ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-ink-400 mr-1">来源</span>
        {SOURCES.map((s) => (
          <button
            key={s.key || 'src-all'}
            onClick={() => setSource(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
              source === s.key
                ? 'bg-gold-500/15 border-gold-500 text-gold-700'
                : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
            }`}
          >
            {s.label}
            <span className="ml-1 opacity-70">{s.key ? countSource(s.key) : ''}</span>
          </button>
        ))}
        <input
          className="input-styled flex-1 min-w-[160px]"
          placeholder="搜索标题 / 文件名"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
            ▶ 播放全部音乐
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="py-20 text-center text-ink-400">加载中…</div>
      ) : error ? (
        <div className="py-20 text-center text-rose-600">{error} <button onClick={reload} className="underline ml-2">重试</button></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
          暂无已审核通过的媒体
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {items.map((m) => (
            <div key={m.id} className="glass rounded-2xl overflow-hidden shadow-soft card-hover flex flex-col">
              <div className="relative bg-ink-100 flex items-center justify-center" style={{ height: 172 }}>
                {m.kind === 'video' ? (
                  <Link href={`/media/${m.id}`} className="w-full h-full block">
                    <video
                      src={m.url}
                      poster={m.posterUrl || undefined}
                      preload="metadata"
                      muted
                      className="w-full h-full object-cover bg-black"
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-12 h-12 rounded-full bg-black/45 text-white flex items-center justify-center text-lg backdrop-blur-sm">▶</span>
                    </span>
                  </Link>
                ) : m.kind === 'audio' ? (
                  <button
                    onClick={() => player.playTrack({
                      id: m.id, title: m.title, artist: m.owner || '圣约社区', url: m.url,
                      poster: m.posterUrl, durationSec: m.durationSec,
                    })}
                    className="w-full h-full flex flex-col items-center justify-center gap-2 group"
                    title="在线播放"
                  >
                    <span className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center text-lg shadow-card group-hover:scale-110 transition">▶</span>
                    <span className="text-xs text-ink-500">
                      {m.durationSec ? formatTime(m.durationSec) : '点击播放'}
                    </span>
                  </button>
                ) : m.kind === 'image' ? (
                  <Link href={`/media/${m.id}`} className="w-full h-full block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" decoding="async" src={m.url} alt={m.title} className="w-full h-full object-cover" />
                  </Link>
                ) : (
                  <Link href={`/media/${m.id}`} className="w-full h-full flex flex-col items-center justify-center">
                    <div className="text-5xl mb-2"><TypeIcon kind={m.kind} /></div>
                    <div className="text-xs text-ink-500 uppercase">{m.extension}</div>
                  </Link>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-xs">
                  {m.kindLabel}
                </span>
                {m.source === 'live' && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-600/90 text-white text-[11px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    直播回放
                  </span>
                )}
                {m.durationSec ? (
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/65 text-white text-[11px]">
                    {formatTime(m.durationSec)}
                  </span>
                ) : null}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="font-medium text-ink-900 line-clamp-1" title={m.title}>{m.title}</div>
                <div className="text-xs text-ink-400 mt-1 line-clamp-1">{m.fileName}</div>
                <div className="flex items-center justify-between mt-3 text-xs text-ink-500">
                  <span>{formatSize(m.sizeBytes)}</span>
                  <span>{formatDate(m.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-ink-400">{m.owner || '匿名'}</span>
                  <a href={m.url} download={m.fileName} className="text-xs text-primary-600 hover:underline">下载</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
