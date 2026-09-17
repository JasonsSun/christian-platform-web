'use client';

import { useState, useMemo } from 'react';

/**
 * 和弦谱渲染 + 移调。
 * 歌谱文本约定：用方括号标记和弦，和弦出现在它所对应的歌词之前，例如：
 *   [C]Amazing [G]grace how [Am]sweet the [F]sound
 * 渲染时和弦显示在对应歌词片段的正上方；无方括号标记的行按纯歌词展示。
 */

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

interface ParsedChord {
  root: string;
  suffix: string;
}

function parseChord(s: string): ParsedChord | null {
  const m = s.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  return { root: m[1], suffix: m[2] || '' };
}

function transposeRoot(root: string, steps: number, flats: boolean): string {
  const idx = SHARP.indexOf(root);
  if (idx < 0) return root; // 无法识别的根音原样返回
  const arr = flats ? FLAT : SHARP;
  return arr[((idx + steps) % 12 + 12) % 12];
}

function transposeChord(chord: string, steps: number, flats: boolean): string {
  const p = parseChord(chord);
  if (!p) return chord;
  return transposeRoot(p.root, steps, flats) + p.suffix;
}

function transposeLine(line: string, steps: number, flats: boolean): string {
  if (!steps) return line;
  return line.replace(/\[([^\]]+)\]/g, (_m, c: string) => `[${transposeChord(c, steps, flats)}]`);
}

interface Seg {
  chord: string;
  text: string;
}

function parseLine(line: string): Seg[] {
  const segs: Seg[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let pendingChord = '';
  while ((m = re.exec(line))) {
    const before = line.slice(last, m.index);
    if (before) segs.push({ chord: pendingChord, text: before });
    pendingChord = m[1].trim();
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (tail) segs.push({ chord: pendingChord, text: tail });
  else if (pendingChord) segs.push({ chord: pendingChord, text: '' });
  if (!segs.length) segs.push({ chord: '', text: line });
  return segs;
}

interface Props {
  chords: string;
  /** 原调，如 C / G / Am / F#m */
  originalKey?: string;
  variant?: 'light' | 'dark';
  /** 歌词下方是否允许换行（移动端默认 true） */
  className?: string;
}

export default function ChordSheet({ chords, originalKey = '', variant = 'light', className = '' }: Props) {
  const [steps, setSteps] = useState(0);

  const dark = variant === 'dark';
  const lines = useMemo(
    () => (chords || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l, i, arr) => l !== '' || (i > 0 && i < arr.length - 1)),
    [chords]
  );

  const currentKey = useMemo(() => {
    if (!originalKey) return '';
    return transposeChord(originalKey, steps, false);
  }, [originalKey, steps]);

  const chordClass = dark
    ? 'text-gold-300 font-semibold text-[13px] leading-none mb-1'
    : 'text-primary-600 font-semibold text-[13px] leading-none mb-1';
  const textClass = dark ? 'text-white/90' : 'text-ink-800';
  const wrapClass = dark ? 'text-white/40' : 'text-ink-400';

  if (!lines.length) {
    return (
      <div className={`text-sm py-6 text-center ${wrapClass} ${className}`}>暂无和弦谱</div>
    );
  }

  return (
    <div className={className}>
      {/* 移调控制条 */}
      <div className={`flex items-center justify-between mb-3 px-1 ${dark ? 'text-white/60' : 'text-ink-500'}`}>
        <div className="flex items-center gap-2 text-xs">
          <span>原调</span>
          <span className={`px-2 py-0.5 rounded-md font-semibold ${dark ? 'bg-white/10 text-gold-300' : 'bg-primary-50 text-primary-700'}`}>
            {originalKey || '—'}
          </span>
          {steps !== 0 && (
            <>
              <span>→ 选调</span>
              <span className={`px-2 py-0.5 rounded-md font-semibold ${dark ? 'bg-white/10 text-gold-300' : 'bg-primary-50 text-primary-700'}`}>
                {currentKey || '—'}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSteps((s) => s - 1)}
            className={`w-7 h-7 rounded-lg text-sm font-bold transition ${
              dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-ink-100 hover:bg-ink-200 text-ink-700'
            }`}
            aria-label="降半音"
          >
            −
          </button>
          <span className={`w-8 text-center text-xs ${dark ? 'text-white/70' : 'text-ink-600'}`}>
            {steps > 0 ? `+${steps}` : steps}
          </span>
          <button
            type="button"
            onClick={() => setSteps((s) => s + 1)}
            className={`w-7 h-7 rounded-lg text-sm font-bold transition ${
              dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-ink-100 hover:bg-ink-200 text-ink-700'
            }`}
            aria-label="升半音"
          >
            +
          </button>
          {steps !== 0 && (
            <button
              type="button"
              onClick={() => setSteps(0)}
              className={`ml-1 px-2 h-7 rounded-lg text-xs transition ${
                dark ? 'bg-white/10 hover:bg-white/20 text-white/80' : 'bg-ink-100 hover:bg-ink-200 text-ink-600'
              }`}
            >
              还原
            </button>
          )}
        </div>
      </div>

      <div className="font-serif text-base md:text-lg leading-[2.1] whitespace-pre-wrap">
        {lines.map((line, i) => {
          const segs = parseLine(transposeLine(line, steps, false));
          return (
            <div key={i} className="flex flex-wrap items-end gap-x-3 gap-y-2 mb-1">
              {segs.map((s, j) => (
                <span key={j} className="inline-flex flex-col items-center">
                  <span className={chordClass}>{s.chord}</span>
                  <span className={textClass}>{s.text}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
