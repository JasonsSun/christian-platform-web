'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { parseLyrics } from '@/components/LyricsView';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { SongItem } from '@/lib/types';

export default function SongPresentPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, loading, error } = useApi<SongItem>(`/songs/${id}`);

  const lines = useMemo(
    () => (data ? parseLyrics(data.lyrics || '', data.durationSec || 0).lines : []),
    [data],
  );
  const { convert } = useI18n();

  const [idx, setIdx] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [uiTimer, setUiTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const clamp = (n: number) => Math.max(0, Math.min(lines.length - 1, n));
  const go = (n: number) => setIdx(clamp(n));

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  // 键盘翻页 + 全屏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        go(idx + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        go(idx - 1);
      } else if (e.key === 'Home') {
        go(0);
      } else if (e.key === 'End') {
        go(lines.length - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFs();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, lines.length]);

  // 鼠标移动显示控制栏，静止 3s 后自动隐藏
  useEffect(() => {
    const poke = () => {
      setShowUI(true);
      if (uiTimer) clearTimeout(uiTimer);
      setUiTimer(setTimeout(() => setShowUI(false), 3000));
    };
    poke();
    return () => {
      if (uiTimer) clearTimeout(uiTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white/50">加载中…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-rose-300">
        加载失败：{error || '无此诗歌'}
      </div>
    );
  }

  const cur = lines[idx];
  const next = lines[idx + 1];

  return (
    <div
      className="min-h-screen bg-black text-white select-none overflow-hidden"
      onMouseMove={() => setShowUI(true)}
      onClick={() => go(idx + 1)}
    >
      {/* 控制栏 */}
      <div
        className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <Link href={`/songs/${id}`} className="text-white/70 hover:text-white text-sm">
          ← 退出投屏
        </Link>
        <div className="text-white/60 text-sm">
          {convert(data.title)}
          {data.author ? ` · ${convert(data.author)}` : ''}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFs();
          }}
          className="text-white/70 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/20"
        >
          全屏(F)
        </button>
      </div>

      {/* 歌词主体 */}
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-4xl md:text-6xl lg:text-7xl font-display font-bold leading-tight max-w-5xl">
          {cur ? convert(cur.text) : convert('（无歌词）')}
        </div>
        {next && (
          <div className="mt-8 text-xl md:text-3xl text-white/40 leading-snug max-w-4xl">{convert(next.text)}</div>
        )}
      </div>

      {/* 底部进度 */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 py-4 transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {lines.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'w-6 bg-gold-400' : 'w-1.5 bg-white/30'
            }`}
          />
        ))}
      </div>

      <div
        className={`fixed bottom-12 left-0 right-0 text-center text-white/30 text-xs transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ↑↓ / 空格翻页 · F 全屏 · 点击屏幕下一行
      </div>
    </div>
  );
}
