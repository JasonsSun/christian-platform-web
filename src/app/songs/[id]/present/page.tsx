'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = (n: number) => Math.max(0, Math.min(lines.length - 1, n));
  const go = (n: number) => setIdx(clamp(n));

  // 唤回控制栏并重新排 3s 自动隐藏。原先定时器放在 state 里、poke 只在 mount 时跑过一次，
  // 第一次隐藏之后再动鼠标只是把栏子亮回来，再也没有第二次的收起。
  const poke = useCallback(() => {
    setShowUI(true);
    if (uiTimer.current) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => setShowUI(false), 3000);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (uiTimer.current) clearTimeout(uiTimer.current);
    };
  }, [poke]);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  // 键盘翻页 + 全屏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 收起后的控制栏已移出 Tab 序，键盘进来时先把它唤回来（与 onMouseMove 一致）
      poke();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, lines.length, poke]);

  /* 这一页在 bareRoutes 里，全站导航 / 底部标签栏 / 页脚都不渲染，
     但 <main> 仍带着给它们留的避让内边距（手机 64/80、桌面 80/0）。
     不抵掉的话黑幕上方会露出一条站点底色、下方多出 80px 能滚的空白。 */
  const STAGE = 'min-h-screen -mt-16 md:-mt-20 -mb-20 md:mb-0 bg-black';

  if (loading) {
    return <div className={`${STAGE} flex items-center justify-center text-white/50`}>加载中…</div>;
  }
  if (error || !data) {
    return (
      <div className={`${STAGE} flex items-center justify-center text-rose-300`}>
        加载失败：{error || '无此诗歌'}
      </div>
    );
  }

  const cur = lines[idx];
  const next = lines[idx + 1];

  return (
    <div
      className={`${STAGE} text-white select-none overflow-hidden`}
      onMouseMove={poke}
      onTouchStart={poke}
      onClick={() => go(idx + 1)}
    >
      {/* 控制栏 */}
      <div
        // 只 opacity-0 会把「退出投屏 / 全屏」留在 Tab 序里，成为看不见的焦点陷阱；
        // 叠一层 invisible 才真正移出焦点序列。transition-all 让 visibility 跟着
        // 淡出入（离散属性在 0~1 之间取 visible），收起过程仍然看得见淡出。
        className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 transition-all duration-300 ${
          showUI ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
        }`}
      >
        <Link
          href={`/songs/${id}`}
          className="inline-flex !min-h-[44px] shrink-0 items-center whitespace-nowrap text-white/70 hover:text-white text-sm"
        >
          ← 退出投屏
        </Link>
        <div className="min-w-0 flex-1 truncate text-center text-white/60 text-sm">
          {convert(data.title)}
          {data.author ? ` · ${convert(data.author)}` : ''}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFs();
          }}
          className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-white/70 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/20"
        >
          全屏(F)
        </button>
      </div>

      {/* 歌词主体 */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-8 text-center">
        <div className="text-4xl md:text-6xl lg:text-7xl font-display font-bold leading-tight max-w-5xl">
          {cur ? convert(cur.text) : convert('（无歌词）')}
        </div>
        {next && (
          <div className="mt-8 text-xl md:text-3xl text-white/40 leading-snug max-w-4xl">{convert(next.text)}</div>
        )}
      </div>

      {/* 底部进度 */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 px-4 py-3 transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 触屏没有方向键，回退一句原本没有任何入口；点整屏只会一直往前 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(idx - 1);
          }}
          disabled={idx === 0}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-white/20 px-3 text-sm text-white/70 hover:text-white disabled:opacity-30"
        >
          上一句
        </button>
        <span className="flex flex-wrap items-center justify-center gap-2 min-w-0">
          {lines.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? 'w-6 bg-gold-400' : 'w-1.5 bg-white/30'
              }`}
            />
          ))}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(idx + 1);
          }}
          disabled={idx >= lines.length - 1}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-white/20 px-3 text-sm text-white/70 hover:text-white disabled:opacity-30"
        >
          下一句
        </button>
      </div>

      {/* 底部控制条是 py-3 + 44px 按钮 = 68px 高，提示要压在它上面而不是叠进去 */}
      <div
        className={`fixed bottom-[76px] left-0 right-0 text-center text-white/30 text-xs transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="hidden md:inline">↑↓ / 空格翻页 · F 全屏 · 点击屏幕下一行</span>
        <span className="md:hidden">轻点屏幕看下一句</span>
      </div>
    </div>
  );
}
