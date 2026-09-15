'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { usePlayer } from '@/lib/player';
import { findCollection, songsInCollection } from '@/lib/songCollections';
import SongCard from '@/components/SongCard';
import { IconPlay, IconArrowLeft } from '@/components/icons';
import { SongCardSkeleton } from '@/components/Skeleton';
import type { SongItem } from '@/lib/types';

type SongsResp = { items: SongItem[]; total: number };

export default function SongCollectionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const collection = findCollection(id);
  const player = usePlayer();

  const { data, loading, error } = useApi<SongsResp>('/songs?pageSize=50&sort=hot');
  const songs = data?.items ?? [];
  const items = collection ? songsInCollection(collection, songs) : [];
  const playable = items.filter((s) => !!s.audioUrl);

  const playAll = () => {
    if (!playable.length) return;
    player.playTracks(
      playable.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.author || '圣约社区',
        url: s.audioUrl as string,
        durationSec: s.durationSec,
      })),
      0
    );
  };

  if (!collection) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gold-50 flex items-center justify-center text-3xl">🎵</div>
        <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">没有找到这个主题歌单</h1>
        <p className="text-ink-500 mb-6">歌单可能已更名或调整，去主题歌单页看看其它的吧。</p>
        <Link href="/songs/collections" className="btn-primary inline-block px-6 py-2.5 text-sm">
          浏览主题歌单
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* 头部 */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${collection.gradient}`}>
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 md:pt-10 md:pb-12">
          <Link
            href="/songs/collections"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white transition-colors mb-6"
          >
            <IconArrowLeft className="w-4 h-4" strokeWidth={2} />
            主题歌单
          </Link>

          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/25 flex items-center justify-center text-4xl md:text-5xl flex-shrink-0">
              {collection.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/80 text-sm font-medium mb-1">主题歌单 · {collection.subtitle}</p>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">{collection.name}</h1>
              <p className="text-white/85 text-sm leading-relaxed max-w-2xl">{collection.description}</p>
              <div className="mt-4 flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <button
                  onClick={playAll}
                  disabled={!playable.length}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-ink-900 font-semibold text-sm shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <IconPlay className="w-4 h-4" />
                  {playable.length ? `播放全部（${playable.length}）` : '暂无可播放音频'}
                </button>
                <span className="text-white/80 text-sm">共 {items.length} 首</span>
              </div>
            </div>
          </div>

          {collection.verse && (
            <p className="mt-6 text-white/80 font-serif italic text-sm">「{collection.verse}」</p>
          )}
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SongCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 shadow-soft border border-ink-100 text-center">
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">这个歌单暂时是空的</h3>
            <p className="text-ink-500 mb-6">可能是诗歌标签调整了，换个歌单听听看。</p>
            <Link href="/songs/collections" className="btn-primary inline-block px-6 py-2.5 text-sm">
              换一个歌单
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {items.map((s) => (
              <SongCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
