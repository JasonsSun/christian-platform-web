'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listRecent, clearRecent, type RecentItem } from '@/lib/watchHistory';
import { formatTime } from '@/lib/player';
import { timeAgo } from '@/lib/format';
import { IconFilm, IconMusicNote } from '@/components/icons';

/**
 * 「继续观看 / 继续收听」+ 最近播放列表。
 * 数据来自本地 localStorage（音频与视频共用一份记录）。
 */
export default function RecentPlays({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    setItems(listRecent(limit));
  }, [limit]);

  if (!items.length) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-primary-500 to-primary-700" />
          继续播放
        </h2>
        <button
          onClick={() => { clearRecent(); setItems([]); }}
          className="text-xs text-ink-400 hover:text-rose-600 transition-colors"
        >
          清空记录
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {items.map((it) => {
          const pct = it.dur > 0 ? Math.min(100, (it.sec / it.dur) * 100) : 0;
          const href = it.kind === 'video' ? `/media/${it.id}` : `/media/${it.id}`;
          return (
            <Link
              key={it.id}
              href={href}
              className="snap-start flex-shrink-0 w-40 group"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-ink-800 to-primary-900 shadow-card group-hover:shadow-card-hover transition-shadow">
                {it.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={it.poster} alt={it.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/45">
                    {it.kind === 'video'
                      ? <IconFilm className="h-8 w-8" strokeWidth={1.4} />
                      : <IconMusicNote className="h-8 w-8" strokeWidth={1.4} />}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] tabular-nums">
                  {formatTime(it.sec)}
                  {it.dur > 0 ? ` / ${formatTime(it.dur)}` : ''}
                </span>
              </div>
              <div className="mt-1.5">
                <div className="text-sm font-medium text-ink-800 truncate group-hover:text-primary-700">{it.title}</div>
                <div className="text-[11px] text-ink-400 truncate">
                  {it.artist ? `${it.artist} · ` : ''}{timeAgo(it.at)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
