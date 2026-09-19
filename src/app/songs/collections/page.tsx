'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { SONG_COLLECTIONS, songsInCollection } from '@/lib/songCollections';
import { IconMusicNote, IconArrowLeft } from '@/components/icons';
import type { SongItem } from '@/lib/types';

type SongsResp = { items: SongItem[]; total: number };

export default function SongCollectionsPage() {
  // 一次拉全量（当前歌曲量小），在前端按标签归组；歌曲过百后可改为按歌单拉接口
  const { data, loading, error } = useApi<SongsResp>('/songs?pageSize=50&sort=hot');

  const songs = data?.items ?? [];
  const cards = SONG_COLLECTIONS.map((c) => ({
    c,
    items: songsInCollection(c, songs),
  })).filter((x) => x.items.length > 0);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold-800 via-gold-700 to-gold-900" />
        <div className="absolute inset-0 overflow-hidden">
          {[
            { top: '20%', left: '12%', size: 44, delay: '0s', duration: '6s' },
            { top: '30%', left: '78%', size: 30, delay: '1s', duration: '8s' },
            { top: '60%', left: '24%', size: 38, delay: '2s', duration: '5s' },
          ].map((note, i) => (
            <div
              key={i}
              className="absolute text-white/10 animate-float hidden md:block"
              style={{ top: note.top, left: note.left, animationDelay: note.delay, animationDuration: note.duration }}
            >
              <IconMusicNote className="w-11 h-11" style={{ width: `${note.size}px`, height: `${note.size}px` }} strokeWidth={1.2} />
            </div>
          ))}
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 md:pt-14 md:pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink-950/20 backdrop-blur-sm border border-white/20 mb-5">
            <span className="text-lg">🎵</span>
            <span className="text-white font-medium">{cards.length} 个主题歌单</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">主题歌单</h1>
          <p className="text-base sm:text-lg text-white/95 max-w-2xl mx-auto font-serif italic">
            按你如今的处境找歌——安静灵修、软弱安慰、口唱心和、节期记念。
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/songs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-gold-600 transition-colors"
          >
            <IconArrowLeft className="w-4 h-4" strokeWidth={2} />
            返回全部诗歌
          </Link>
        </div>

        {error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-ui-surface animate-pulse border border-ink-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map(({ c, items }) => (
              <Link
                key={c.id}
                href={`/songs/collections/${c.id}`}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5 border border-ink-100 hover:border-gold-200 p-5"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-3xl flex-shrink-0 shadow-lg`}>
                    {c.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-ink-900 group-hover:text-gold-600 transition-colors truncate">
                        {c.name}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 flex-shrink-0">{items.length} 首</span>
                    </div>
                    <p className="text-sm text-ink-500 mt-0.5 truncate">{c.subtitle}</p>
                    <p className="text-xs text-ink-400 mt-2 leading-relaxed line-clamp-2">{c.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {items.slice(0, 3).map((s) => (
                    <span key={s.id} className="text-xs text-ink-600 bg-ink-50 px-2 py-1 rounded-full truncate max-w-[9rem]">
                      {s.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className="text-xs text-ink-400">等 {items.length} 首</span>}
                </div>

                {c.verse && (
                  <p className="mt-3 text-xs text-gold-700 font-serif italic truncate">「{c.verse}」</p>
                )}
              </Link>
            ))}
          </div>
        )}

        {!loading && !error && cards.length === 0 && (
          <div className="bg-white rounded-2xl p-10 shadow-soft border border-ink-100 text-center">
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">暂无可用的主题歌单</h3>
            <p className="text-ink-500">待诗歌库收录更多曲目后，这里会按主题自动聚合。</p>
          </div>
        )}
      </div>
    </div>
  );
}
