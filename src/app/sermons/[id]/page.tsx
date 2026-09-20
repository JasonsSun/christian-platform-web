'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useNotice } from '@/lib/notice';
import { HlsPlayer } from '@/components/HlsPlayer';
import {
  IconArrowLeft,
  IconMicWave,
  IconBookOpen,
  IconCalendar,
  IconPlay,
  IconHeart,
  IconHeadphones,
} from '@/components/icons';

interface Sermon {
  id: string;
  seriesId: string | null;
  seriesTitle: string | null;
  title: string;
  speaker: string;
  scripture: string;
  preachedAt: string | null;
  description: string;
  notes: string;
  mediaType: 'audio' | 'video' | 'none';
  mediaUrl: string;
  durationSec: number;
  cover: string;
  viewCount: number;
  likeCount: number;
  status: string;
  createdAt: string;
  liked?: boolean;
}

function fmtDur(s: number): string {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function SermonDetailPage({ params }: { params: { id: string } }) {
  const { t, convert } = useI18n();
  const { user } = useAuth();
  const notice = useNotice();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApi<Sermon>(`/sermons/${params.id}`, [params.id]);

  const isLiked = liked ?? data?.liked ?? false;

  const titleEl = useMemo(() => (data ? convert(data.title) : ''), [data]);

  async function toggleLike() {
    if (!user) {
      notice.error('请先登录后再点赞');
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !isLiked;
    setLiked(next); // 乐观更新
    try {
      if (next) await apiPost(`/sermons/${params.id}/like`);
      else await apiDelete(`/sermons/${params.id}/like`);
    } catch (e: any) {
      setLiked(!next);
      notice.error(e?.message || '操作失败');
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (error)
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center text-ink-500">
        {error}
        <div className="mt-4">
          <Link href="/sermons" className="btn-secondary">返回讲道列表</Link>
        </div>
      </div>
    );
  if (!data) return null;

  const isHls = data.mediaType === 'video' && /\.m3u8($|\?)/.test(data.mediaUrl);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/sermons" className="mb-4 inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline">
        <IconArrowLeft className="w-4 h-4" strokeWidth={2} />
        {convert(t('nav.sermons'))}
      </Link>

      {data.seriesTitle ? (
        <div className="text-sm text-ink-400 mb-1">系列：{convert(data.seriesTitle)}</div>
      ) : null}

      <h1 className="font-display text-3xl font-bold text-ink-900 mb-3">{titleEl}</h1>

      <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500 mb-5">
        {data.speaker ? (
          <span className="inline-flex items-center gap-1">
            <IconMicWave className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {convert(data.speaker)}
          </span>
        ) : null}
        {data.scripture ? (
          <Link
            href={`/search?q=${encodeURIComponent(data.scripture)}`}
            className="inline-flex items-center gap-1 text-primary-600 hover:underline"
          >
            <IconBookOpen className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {convert(data.scripture)}
          </Link>
        ) : null}
        {data.preachedAt ? (
          <span className="inline-flex items-center gap-1">
            <IconCalendar className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {data.preachedAt}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <IconPlay className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
          {data.viewCount} 次播放
        </span>
        <span className="inline-flex items-center gap-1">
          <IconHeart className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
          <span className="sr-only">点赞</span>
          {data.likeCount}
        </span>
      </div>

      {/* 媒体播放 */}
      {data.mediaType !== 'none' && data.mediaUrl ? (
        <div className="mb-6">
          {data.mediaType === 'audio' ? (
            <div className="glass rounded-2xl p-5 shadow-soft">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center flex-shrink-0">
                  <IconHeadphones className="w-5 h-5" strokeWidth={1.7} />
                </span>
                <div>
                  <div className="font-medium text-ink-900">音频讲道</div>
                  {fmtDur(data.durationSec) ? (
                    <div className="num text-xs text-ink-400">时长 {fmtDur(data.durationSec)}</div>
                  ) : null}
                </div>
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={data.mediaUrl} className="w-full" preload="metadata" />
            </div>
          ) : isHls ? (
            <HlsPlayer src={data.mediaUrl} poster={data.cover || null} />
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video controls src={data.mediaUrl} poster={data.cover || undefined} className="w-full aspect-video rounded-2xl bg-black" preload="metadata" />
          )}
        </div>
      ) : null}

      {/* 点赞 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={toggleLike}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 min-h-[2.75rem] px-5 py-2 rounded-full font-medium transition ${
            isLiked ? 'bg-rose-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
          }`}
          aria-pressed={isLiked}
        >
          <IconHeart className="w-4 h-4" strokeWidth={1.9} fill={isLiked ? 'currentColor' : 'none'} />
          {isLiked ? '已点赞' : '点赞'}
        </button>
        <span className="num text-sm text-ink-400">{data.likeCount} 人点赞</span>
      </div>

      {/* 简介 */}
      {data.description ? (
        <p className="text-ink-600 mb-6 leading-relaxed">{convert(data.description)}</p>
      ) : null}

      {/* 讲章 / 大纲 */}
      <div className="glass rounded-2xl p-6 shadow-soft">
        <h2 className="font-display text-xl font-bold text-ink-900 mb-4">讲章大纲</h2>
        {data.notes ? (
          <div className="whitespace-pre-wrap text-ink-700 leading-relaxed">{convert(data.notes)}</div>
        ) : (
          <p className="text-ink-400">本篇暂未提供文字讲章。</p>
        )}
      </div>
    </div>
  );
}
