'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { saveProgress, clearProgress, resumableAt, touchRecent } from '@/lib/watchHistory';

export interface Track {
  id: string;
  title: string;
  artist?: string;
  url: string;
  poster?: string;
  durationSec?: number;
}

interface PlayerCtx {
  tracks: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  /** 播放模式:列表循环 / 单曲循环 / 随机 / 顺序 */
  mode: PlayMode;
  setMode: (m: PlayMode) => void;
  cycleMode: () => void;
  playTracks: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  stop: () => void;
  isCurrent: (id: string) => boolean;
}

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlayer 必须在 PlayerProvider 内使用');
  return c;
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ---------------- 播放模式 ---------------- */

export type PlayMode = 'loop' | 'repeat-one' | 'shuffle' | 'sequential';

export const PLAY_MODE_META: Record<PlayMode, { icon: string; label: string }> = {
  loop: { icon: '🔁', label: '列表循环' },
  'repeat-one': { icon: '🔂', label: '单曲循环' },
  shuffle: { icon: '🔀', label: '随机播放' },
  sequential: { icon: '➡️', label: '顺序播放' },
};

const MODE_ORDER: PlayMode[] = ['loop', 'repeat-one', 'shuffle', 'sequential'];

export function nextMode(m: PlayMode): PlayMode {
  const i = MODE_ORDER.indexOf(m);
  return MODE_ORDER[(i + 1) % MODE_ORDER.length];
}

/* ---------------- 播放进度记忆（本地） ----------------
 * 与 @/lib/watchHistory 共用同一份存储，音频与视频统一进入「最近播放」。
 * 存 localStorage 轻量实现，无需登录；服务端后续可接 /me/history 做跨设备同步。
 */

const MODE_KEY = 'cp_play_mode';

/**
 * 写入音频进度（同时进入最近播放列表）。
 * 视频请直接调用 watchHistory 的 saveProgress / touchRecent。
 */
function writeAudioProgress(t: Track | null, pos: number, dur: number) {
  if (typeof window === 'undefined' || !t?.id) return;
  saveProgress({ id: t.id, sec: pos, dur, at: Date.now() });
  touchRecent({
    id: t.id, sec: pos, dur, at: Date.now(),
    title: t.title, artist: t.artist, poster: t.poster, kind: 'audio',
  });
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  // 播放模式:默认列表循环(教会场景最常用,播完自动下一首)
  const [mode, setModeState] = useState<PlayMode>('loop');

  const current = tracks.length ? tracks[index] ?? null : null;

  const indexRef = useRef(0);
  const modeRef = useRef<PlayMode>(mode);
  const lastSaveRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // 恢复上次选择的播放模式
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY) as PlayMode | null;
      if (m && MODE_ORDER.includes(m)) setModeState(m);
    } catch { /* ignore */ }
  }, []);

  const setMode = useCallback((m: PlayMode) => {
    setModeState(m);
    modeRef.current = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }, []);

  const cycleMode = useCallback(() => {
    setMode(nextMode(modeRef.current));
  }, [setMode]);

  // 单例 audio 元素
  useEffect(() => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.volume = 0.85;
    el.setAttribute('data-global-player', '1');
    el.style.display = 'none';
    document.body.appendChild(el);
    audioRef.current = el;
    const onTime = () => {
      setCurrentTime(el.currentTime);
      // 每 5 秒记一次进度,下次打开可续播
      const t = tracksRef.current[indexRef.current];
      if (t && el.currentTime > 0) {
        const now = Date.now();
        if (now - lastSaveRef.current > 5000) {
          lastSaveRef.current = now;
          writeAudioProgress(t, el.currentTime, el.duration || 0);
        }
      }
    };
    const onMeta = () => {
      setDuration(el.duration || 0);
      // 元数据就绪后再跳转到记忆位置(此前设置会被浏览器忽略)
      if (pendingSeekRef.current != null) {
        try {
          el.currentTime = pendingSeekRef.current;
          setCurrentTime(pendingSeekRef.current);
        } catch { /* ignore */ }
        pendingSeekRef.current = null;
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      const t = tracksRef.current[indexRef.current];
      if (t && el.currentTime > 0) writeAudioProgress(t, el.currentTime, el.duration || 0);
    };
    const onEnd = () => {
      const list = tracksRef.current;
      const cur = indexRef.current;
      const t = list[cur];
      // 听完就清掉进度,下次从头开始
      if (t) clearProgress(t.id);
      if (!list.length) { setPlaying(false); return; }

      const m = modeRef.current;
      if (m === 'repeat-one') {
        el.currentTime = 0;
        setCurrentTime(0);
        void el.play().catch(() => setPlaying(false));
        return;
      }
      // 顺序播放:最后一首播完即停止
      if (m === 'sequential' && cur >= list.length - 1) {
        setPlaying(false);
        setCurrentTime(0);
        return;
      }
      let n: number;
      if (m === 'shuffle') {
        if (list.length === 1) {
          n = 0;
        } else {
          do { n = Math.floor(Math.random() * list.length); } while (n === cur);
        }
      } else {
        n = (cur + 1) % list.length;
      }
      setPlaying(false);
      setIndex(n);
      setTimeout(() => void playAt(n), 0);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    setReady(true);
    return () => {
      el.pause();
      el.remove();
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
      audioRef.current = null;
    };
  }, []);

  const tracksRef = useRef<Track[]>([]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const playAt = useCallback(async (i: number) => {
    const el = audioRef.current;
    const t = tracksRef.current[i];
    if (!el || !t) return;
    if (el.src !== t.url) {
      el.src = t.url;
      el.load();
    }
    // 续播:上次听到哪儿就从哪儿继续(在 loadedmetadata 里真正跳转)
    const resume = resumableAt(t.id) ?? 0;
    pendingSeekRef.current = resume > 0 ? resume : null;
    setCurrentTime(resume > 0 ? resume : 0);
    try {
      await el.play();
    } catch {
      setPlaying(false);
    }
  }, []);

  const playTracks = useCallback((list: Track[], startIndex = 0) => {
    if (!list.length) return;
    setTracks(list);
    tracksRef.current = list;
    const i = Math.max(0, Math.min(startIndex, list.length - 1));
    setIndex(i);
    setTimeout(() => void playAt(i), 0);
  }, [playAt]);

  const playTrack = useCallback((t: Track) => {
    playTracks([t], 0);
  }, [playTracks]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [current]);

  const next = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return;
    let n: number;
    if (modeRef.current === 'shuffle' && list.length > 1) {
      do { n = Math.floor(Math.random() * list.length); } while (n === index);
    } else {
      n = (index + 1) % list.length;
    }
    setIndex(n);
    void playAt(n);
  }, [index, playAt]);

  const prev = useCallback(() => {
    if (!tracksRef.current.length) return;
    const n = (index - 1 + tracksRef.current.length) % tracksRef.current.length;
    setIndex(n);
    void playAt(n);
  }, [index, playAt]);

  const seek = useCallback((sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
    setCurrentTime(sec);
  }, []);

  const setVolume = useCallback((v: number) => {
    const el = audioRef.current;
    const val = Math.max(0, Math.min(1, v));
    setVolumeState(val);
    if (el) el.volume = val;
    if (val > 0 && muted) {
      setMuted(false);
      if (el) el.muted = false;
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    setMuted((m) => {
      const nm = !m;
      if (el) el.muted = nm;
      return nm;
    });
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
    setTracks([]);
    tracksRef.current = [];
    setIndex(0);
  }, []);

  const isCurrent = useCallback((id: string) => current?.id === id, [current]);

  const value = useMemo<PlayerCtx>(() => ({
    tracks, index, current, playing, currentTime, duration, volume, muted,
    mode, setMode, cycleMode,
    playTracks, playTrack, toggle, next, prev, seek, setVolume, toggleMute, stop, isCurrent,
  }), [tracks, index, current, playing, currentTime, duration, volume, muted,
      mode, setMode, cycleMode,
      playTracks, playTrack, toggle, next, prev, seek, setVolume, toggleMute, stop, isCurrent]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {ready ? <PlayerBar /> : null}
    </Ctx.Provider>
  );
}

/* ---------------- 悬浮迷你播放器 ---------------- */

function PlayerBar() {
  const p = usePlayer();
  const [openList, setOpenList] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 卡片可自由拖动:pos 为 null 时用默认右下角定位,拖动后记录绝对 left/top
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardDrag = useRef<{ dx: number; dy: number } | null>(null);

  // 拖动开始:记录按下点相对卡片左上角的偏移;交互控件(按钮/输入框/进度条)不触发拖动
  function onCardPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('button, input, a, [data-seekbar]')) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    cardDrag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    try { card.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
  }
  function onCardPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!cardDrag.current) return;
    setPos({ x: e.clientX - cardDrag.current.dx, y: e.clientY - cardDrag.current.dy });
  }
  function onCardPointerUp() {
    cardDrag.current = null;
  }

  // 播放器出现时为页面底部留出空间,避免悬浮卡片遮挡右下角内容
  useEffect(() => {
    document.documentElement.classList.add('has-player');
    return () => document.documentElement.classList.remove('has-player');
  }, []);

  // 歌单打开时把当前曲目滚动到可视区域
  useEffect(() => {
    if (!openList || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-active="1"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [openList, p.index]);

  if (!p.current) return null;

  const shown = dragging ? draft : p.currentTime;
  const dur = p.duration || p.current.durationSec || 0;
  const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0;

  function seekFromEvent(clientX: number) {
    const el = barRef.current;
    if (!el || dur <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const sec = ratio * dur;
    setDraft(sec);
    return sec;
  }

  // 底部导航高度(移动端 h-16 = 4rem)
  const bottom = 'calc(5rem + env(safe-area-inset-bottom))';

  return (
    <>
      {/* 播放列表:跟随悬浮卡片,从右下角弹出 */}
      {openList ? (
        <div
          ref={listRef}
          className="fixed z-[60] right-4 md:right-6 max-w-[min(20rem,calc(100vw-2rem))] max-h-[50vh] overflow-auto glass rounded-2xl shadow-card-hover p-3"
          style={{ bottom: 'calc(7.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between px-1 pb-2 sticky top-0 bg-white/80 backdrop-blur-sm -mx-1 px-1 pt-1">
            <span className="text-sm font-semibold text-ink-800">歌单（{p.tracks.length}）</span>
            <button onClick={() => setOpenList(false)} className="text-ink-400 hover:text-ink-700 text-sm">收起</button>
          </div>
          {p.tracks.map((t, i) => (
            <button
              key={t.id + i}
              data-active={i === p.index ? '1' : '0'}
              onClick={() => { p.playTracks(p.tracks, i); }}
              className={`w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl transition border-l-2 ${
                i === p.index
                  ? 'bg-primary-50 border-primary-600'
                  : 'border-transparent hover:bg-ink-100'
              }`}
            >
              <span className={`w-5 text-center text-xs ${i === p.index ? 'text-primary-600' : 'text-ink-400'}`}>
                {i === p.index ? (
                  <span className={`inline-flex items-end gap-[2px] h-3 ${p.playing ? '' : 'opacity-40'}`}>
                    <span className="w-[2px] bg-primary-600 h-2 animate-pulse" />
                    <span className="w-[2px] bg-primary-600 h-3 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-[2px] bg-primary-600 h-1.5 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : i + 1}
              </span>
              {t.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={t.poster} alt="" className="w-9 h-9 rounded-lg object-cover" />
              ) : (
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs">🎵</span>
              )}
              <span className="flex-1 min-w-0">
                <span className={`block truncate text-sm ${i === p.index ? 'text-primary-700 font-semibold' : 'text-ink-700'}`}>{t.title}</span>
                {t.artist ? <span className="block truncate text-xs text-ink-400">{t.artist}</span> : null}
              </span>
              {i === p.index ? <span className="text-[10px] text-primary-600 flex-shrink-0">播放中</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* 悬浮迷你播放卡片:右下角紧凑圆角块,可自由拖动 */}
      <div
        ref={cardRef}
        onPointerDown={onCardPointerDown}
        onPointerMove={onCardPointerMove}
        onPointerUp={() => { cardDrag.current = null; }}
        onPointerCancel={() => { cardDrag.current = null; }}
        className="fixed z-[55] w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-200 bg-white/95 backdrop-blur-md shadow-card-hover overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
        style={pos ? { left: pos.x, top: pos.y } : { right: '1rem', bottom }}
      >
        {/* 顶部细进度条 */}
        <div
          ref={barRef}
          data-seekbar="1"
          className="absolute top-0 left-0 right-0 h-1 bg-ink-100 cursor-pointer"
          onMouseDown={(e) => { setDragging(true); seekFromEvent(e.clientX); }}
          onMouseMove={(e) => { if (dragging) seekFromEvent(e.clientX); }}
          onMouseUp={(e) => { const s = seekFromEvent(e.clientX); if (s !== undefined) p.seek(s); setDragging(false); }}
          onMouseLeave={() => { if (dragging) setDragging(false); }}
          onTouchStart={(e) => { setDragging(true); seekFromEvent(e.touches[0].clientX); }}
          onTouchMove={(e) => { if (dragging) seekFromEvent(e.touches[0].clientX); }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            const s = t ? seekFromEvent(t.clientX) : undefined;
            if (s !== undefined) p.seek(s);
            setDragging(false);
          }}
        >
          <div className="h-full bg-gradient-to-r from-primary-500 to-primary-700" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
          {/* 封面 */}
          {p.current.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={p.current.poster} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white flex-shrink-0">🎵</div>
          )}

          {/* 标题 + 时间 */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-900">{p.current.title}</div>
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs text-ink-400">{p.current.artist || '圣约社区'}</span>
              <span className="text-xs text-ink-500 tabular-nums flex-shrink-0">{formatTime(shown)} / {formatTime(dur)}</span>
            </div>
          </div>

          {/* 控制 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={p.prev} title="上一首" className="w-8 h-8 rounded-full text-ink-600 hover:bg-ink-100 flex items-center justify-center text-sm">⏮</button>
            <button
              onClick={p.toggle}
              title={p.playing ? '暂停' : '播放'}
              className="w-10 h-10 rounded-full bg-primary-600 text-white shadow-card hover:bg-primary-700 flex items-center justify-center"
            >
              {p.playing ? '❚❚' : '▶'}
            </button>
            <button onClick={p.next} title="下一首" className="w-8 h-8 rounded-full text-ink-600 hover:bg-ink-100 flex items-center justify-center text-sm">⏭</button>
          </div>
        </div>

        {/* 第二行:模式 + 音量 + 列表 + 关闭 */}
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <button
            onClick={p.cycleMode}
            title={PLAY_MODE_META[p.mode].label}
            aria-label={`播放模式:${PLAY_MODE_META[p.mode].label}`}
            className="w-8 h-8 rounded-full text-ink-500 hover:bg-ink-100 flex items-center justify-center text-sm"
          >
            {PLAY_MODE_META[p.mode].icon}
          </button>

          <button onClick={p.toggleMute} className="w-8 h-8 rounded-full text-ink-500 hover:bg-ink-100 flex items-center justify-center" title="静音">
            {p.muted || p.volume === 0 ? '🔇' : '🔊'}
          </button>
          <input
            type="range" min={0} max={1} step={0.01} value={p.muted ? 0 : p.volume}
            onChange={(e) => p.setVolume(Number(e.target.value))}
            className="w-16 accent-primary-600"
            aria-label="音量"
          />

          <div className="flex-1" />

          <button
            onClick={() => setOpenList((v) => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              openList ? 'bg-primary-50 text-primary-700' : 'text-ink-500 hover:bg-ink-100'
            }`}
            title="播放列表"
          >
            ☰
          </button>
          <button onClick={p.stop} className="w-8 h-8 rounded-full text-ink-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" title="关闭">
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
