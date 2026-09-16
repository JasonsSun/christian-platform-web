'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { timeAgo } from '@/lib/format';

interface Sermon {
  id: string;
  seriesId: string | null;
  seriesTitle: string | null;
  title: string;
  speaker: string;
  scripture: string;
  preachedAt: string | null;
  description: string;
  mediaType: 'audio' | 'video' | 'none';
  mediaUrl: string;
  durationSec: number;
  cover: string;
  viewCount: number;
  likeCount: number;
  status: string;
  createdAt: string;
}

interface ListResp {
  items: Sermon[];
  total: number;
  speakers: string[];
}

function fmtDur(s: number): string {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function SermonsPage() {
  const { t, convert } = useI18n();
  const [q, setQ] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [sort, setSort] = useState('new');

  const { data: seriesData } = useApi<{ items: { id: string; title: string }[] }>('/sermon-series');
  const { data, loading, error, reload } = useApi<ListResp>(
    `/sermons?q=${encodeURIComponent(q)}&seriesId=${seriesId}&speaker=${encodeURIComponent(speaker)}&sort=${sort}&pageSize=24`,
    [q, seriesId, speaker, sort]
  );

  const items = data?.items || [];
  const speakers = data?.speakers || [];

  const titleEl = useMemo(() => convert(t('nav.sermons')), [t]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">{titleEl}</h1>
          <p className="text-ink-500 mt-1">教会讲道录音与视频，按系列与讲员整理，供反复聆听、喂养灵命。</p>
        </div>
        <Link href="/admin/sermons" className="btn-secondary text-sm">
          管理讲道
        </Link>
      </div>

      {/* 筛选条 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          className="input-styled flex-1 min-w-[180px]"
          placeholder="搜索标题 / 讲员 / 经文"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input-styled" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
          <option value="">全部系列</option>
          {(seriesData?.items || []).map((s) => (
            <option key={s.id} value={s.id}>{convert(s.title)}</option>
          ))}
        </select>
        <select className="input-styled" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="">全部讲员</option>
          {speakers.map((sp) => (
            <option key={sp} value={sp}>{convert(sp)}</option>
          ))}
        </select>
        <select className="input-styled" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">最近讲道</option>
          <option value="old">最早讲道</option>
          <option value="hot">最受欢迎</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center text-ink-400 py-20">加载中…</div>
      ) : error ? (
        <div className="text-center text-rose-600 py-20">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center text-ink-400 py-20">暂无讲道，敬请期待。</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/sermons/${s.id}`}
              className="glass rounded-2xl overflow-hidden shadow-soft hover:shadow-card transition group"
            >
              <div className="aspect-video bg-gradient-to-br from-primary-600 to-primary-800 relative flex items-center justify-center">
                {s.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white/80 text-5xl">🎙️</span>
                )}
                <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/40 text-white">
                  {s.mediaType === 'audio' ? '音频' : s.mediaType === 'video' ? '视频' : '文稿'}
                </span>
                {fmtDur(s.durationSec) ? (
                  <span className="absolute bottom-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 text-white">
                    {fmtDur(s.durationSec)}
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-ink-900 line-clamp-2 group-hover:text-primary-700 transition">
                  {convert(s.title)}
                </h3>
                <div className="text-sm text-ink-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {s.speaker ? <span>🗣 {convert(s.speaker)}</span> : null}
                  {s.scripture ? <span>📖 {convert(s.scripture)}</span> : null}
                </div>
                <div className="text-xs text-ink-400 mt-2 flex items-center gap-3">
                  {s.preachedAt ? <span>{s.preachedAt}</span> : <span>{timeAgo(s.createdAt)}</span>}
                  <span>▶ {s.viewCount}</span>
                  <span>♥ {s.likeCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
