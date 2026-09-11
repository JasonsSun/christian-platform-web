'use client';

import { useEffect, useMemo, useRef } from 'react';

export interface LyricLine {
  /** 起始秒;无时间轴时为 -1 */
  time: number;
  text: string;
}

/**
 * 解析歌词。
 * 1) 优先识别 LRC 时间轴(支持一行多个时间戳,如 `[00:12.50]歌词`);
 * 2) 纯文本歌词(无时间戳)则按总时长**平均分配**每行起始时间,
 *    这样仍能大致跟随播放高亮,只是精度不如 LRC。
 */
export function parseLyrics(raw: string, duration = 0): { lines: LyricLine[]; timed: boolean } {
  const src = (raw || '').trim();
  if (!src) return { lines: [], timed: false };

  const re = /\[(\d{1,2}):(\d{1,3})(?:[.:](\d{1,3}))?\]/g;
  const out: LyricLine[] = [];

  for (const row of src.split(/\r?\n/)) {
    re.lastIndex = 0;
    const times: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(row))) {
      const mm = Number(m[1]);
      const ss = Number(m[2]);
      const frac = m[3] ? Number(m[3]) / (m[3].length === 3 ? 1000 : 100) : 0;
      times.push(mm * 60 + ss + frac);
    }
    const text = row.replace(re, '').trim();
    if (!text) continue;
    if (times.length) times.forEach((t) => out.push({ time: t, text }));
    else out.push({ time: -1, text });
  }

  out.sort((a, b) => a.time - b.time);
  const timed = out.length > 0 && out.every((l) => l.time >= 0);

  // 无时间轴:按总时长平均分配到每一行
  if (!timed && duration > 0 && out.length) {
    const step = duration / out.length;
    out.forEach((l, i) => { l.time = i * step; });
  }
  return { lines: out, timed };
}

interface Props {
  lyrics: string;
  currentTime: number;
  duration: number;
  /** 点击某行跳转到对应时间 */
  onSeek?: (sec: number) => void;
  className?: string;
  /** light=浅色背景(默认);dark=深色背景(如诗歌详情页) */
  variant?: 'light' | 'dark';
}

export default function LyricsView({
  lyrics,
  currentTime,
  duration,
  onSeek,
  className = '',
  variant = 'light',
}: Props) {
  const { lines, timed } = useMemo(
    () => parseLyrics(lyrics, duration),
    [lyrics, duration]
  );

  // 当前高亮行:取最后一个已到达的时间点
  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime + 0.2) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTime]);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // 当前行滚动到可视区中部
  useEffect(() => {
    const box = boxRef.current;
    const el = activeRef.current;
    if (!box || !el) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIdx]);

  const dark = variant === 'dark';

  if (!lines.length) {
    return (
      <div className={`text-sm py-6 text-center ${dark ? 'text-white/40' : 'text-ink-400'} ${className}`}>
        暂无歌词
      </div>
    );
  }

  return (
    <div className={className}>
      {!timed && duration > 0 ? (
        <p className={`text-xs mb-2 px-1 ${dark ? 'text-white/40' : 'text-ink-400'}`}>
          该歌词未标记时间轴，高亮为按总时长估算；点击任意一行可跳转到对应位置。
        </p>
      ) : null}
      <div
        ref={boxRef}
        className="max-h-[46vh] md:max-h-[420px] overflow-y-auto px-1 py-2 space-y-1 scroll-smooth"
      >
        {lines.map((l, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={i}
              ref={active ? activeRef : null}
              onClick={() => onSeek?.(Math.max(0, l.time))}
              className={`block w-full text-left px-3 py-1.5 rounded-xl transition-all duration-200 ${
                active
                  ? dark
                    ? 'bg-white/10 text-gold-300 font-semibold text-base md:text-lg scale-[1.02]'
                    : 'bg-primary-50 text-primary-700 font-semibold text-base md:text-lg scale-[1.02]'
                  : dark
                    ? 'text-white/60 hover:bg-white/5 text-sm md:text-base'
                    : 'text-ink-500 hover:bg-ink-50 text-sm md:text-base'
              }`}
            >
              {l.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
