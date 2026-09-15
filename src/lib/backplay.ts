'use client';

/**
 * 后台播放 / 锁屏续播能力。
 *
 * 目标:手机息屏、切到微信/桌面后,经文朗读与诗歌仍能继续出声,并且锁屏画面
 * (Android 通知栏、iOS 控制中心)能显示标题 + 播放/暂停控件。
 *
 * 三条硬约束:
 * 1) **只有真正的 <audio>/<video> 元素才能后台出声**。浏览器原生 speechSynthesis
 *    在 iOS 息屏后会被系统挂起(而且没有任何事件通知),所以「允许后台」时
 *    经文朗读必须走服务端合成 + <audio> 播放(见 @/lib/useSpeech)。
 * 2) **Media Session 是全局单例**:整页只有一个媒体会话,诗歌 / 朗读 / 视频共存时
 *    会互相抢。这里用 owner 令牌抢占:谁最后触发 play 谁接管。
 * 3) **用户必须能关**:偏好存本地,随时可切;关掉后页面一隐藏就立刻暂停。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const BG_KEY = 'cp_background_play';
const CHANGED_EVENT = 'cp:backplay-changed';

/* ---------------- 偏好:是否允许后台播放 ---------------- */

/** 默认开启:用户的核心诉求就是「息屏也能听」 */
export function backgroundPlayEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(BG_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setBackgroundPlay(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BG_KEY, on ? '1' : '0');
  } catch {
    /* 隐私模式下写不了,忽略 */
  }
  try {
    window.dispatchEvent(new CustomEvent<boolean>(CHANGED_EVENT, { detail: !!on }));
  } catch {
    /* ignore */
  }
}

/** 响应式读取后台播放偏好(跨组件 / 多标签页同步) */
export function useBackgroundPlay(): { enabled: boolean; setEnabled: (v: boolean) => void } {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    const sync = () => setEnabled(backgroundPlayEnabled());
    sync();
    const onEvt = (e: Event) => setEnabled(!!(e as CustomEvent<boolean>).detail);
    const onStore = (e: StorageEvent) => {
      if (e.key === BG_KEY) sync();
    };
    window.addEventListener(CHANGED_EVENT, onEvt as EventListener);
    window.addEventListener('storage', onStore);
    return () => {
      window.removeEventListener(CHANGED_EVENT, onEvt as EventListener);
      window.removeEventListener('storage', onStore);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    setBackgroundPlay(v);
    setEnabled(!!v);
  }, []);

  return { enabled, setEnabled: set };
}

/* ---------------- Media Session(锁屏/通知栏控件) ---------------- */

export interface NowPlayingMeta {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string[];
}

export interface NowPlayingHandlers {
  play?: () => void;
  pause?: () => void;
  stop?: () => void;
  prev?: () => void;
  next?: () => void;
  seekBy?: (deltaSec: number) => void;
}

type MS = {
  metadata: any;
  playbackState: string;
  setActionHandler: (action: string, fn: ((d: any) => void) | null) => void;
  setPositionState: (s?: any) => void;
};

function ms(): MS | null {
  if (typeof navigator === 'undefined') return null;
  const m = (navigator as any).mediaSession;
  return m ? (m as MS) : null;
}

export function mediaSessionSupported(): boolean {
  return !!ms();
}

/** 当前接管者:只有它有权清理 / 覆盖 meta */
let activeOwner: symbol | null = null;

function absolute(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

/** 写入锁屏信息;owner 不匹配(别的播放器正在播)时返回 false */
export function setNowPlaying(
  owner: symbol,
  meta: NowPlayingMeta,
  handlers: NowPlayingHandlers = {},
  opts: { playbackState?: 'playing' | 'paused' } = {},
): boolean {
  const m = ms();
  if (!m) return false;
  activeOwner = owner;
  try {
    const art = (meta.artwork || []).map(absolute).filter(Boolean) as string[];
    const MediaMetadataCtor = (window as any).MediaMetadata;
    if (MediaMetadataCtor) {
      m.metadata = new MediaMetadataCtor({
        title: meta.title || '圣约社区',
        artist: meta.artist || '圣约社区',
        album: meta.album || '',
        artwork: art.length
          ? art.map((src) => ({ src, sizes: '512x512', type: 'image/png' }))
          : [],
      });
    }
  } catch {
    /* artwork 非法(如跨域 svg)不影响出声 */
  }

  // 未提供的动作必须显式置 null,否则旧handler会继续被调用(串到上一首的控制)
  const bind = (action: string, fn?: (payload?: any) => void) => {
    try {
      m.setActionHandler(action, fn ? (fn as any) : null);
    } catch {
      /* 不支持的 action 直接忽略 */
    }
  };
  bind('play', handlers.play);
  bind('pause', handlers.pause);
  bind('stop', handlers.stop);
  bind('previoustrack', handlers.prev);
  bind('nexttrack', handlers.next);
  bind('seekbackward', handlers.seekBy ? () => handlers.seekBy?.(-15) : undefined);
  bind('seekforward', handlers.seekBy ? () => handlers.seekBy?.(30) : undefined);

  try {
    m.playbackState = opts.playbackState || 'playing';
  } catch {
    /* ignore */
  }
  return true;
}

export function setPlaybackState(owner: symbol, state: 'playing' | 'paused'): void {
  const m = ms();
  if (!m || activeOwner !== owner) return;
  try {
    m.playbackState = state;
  } catch {
    /* ignore */
  }
}

/** Android 通知栏进度条;duration 未知时不要调用(会抛错) */
export function setPosition(owner: symbol, positionSec: number, durationSec: number, rate = 1): void {
  const m = ms();
  if (!m || activeOwner !== owner) return;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return;
  const pos = Math.max(0, Math.min(Number(positionSec) || 0, durationSec));
  try {
    m.setPositionState({ duration: durationSec, position: pos, playbackRate: rate });
  } catch {
    /* ignore */
  }
}

export function clearNowPlaying(owner: symbol): void {
  const m = ms();
  if (!m || activeOwner !== owner) return;
  activeOwner = null;
  try {
    m.metadata = null;
    m.playbackState = 'none';
  } catch {
    /* ignore */
  }
  for (const a of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward']) {
    try {
      m.setActionHandler(a, null);
    } catch {
      /* ignore */
    }
  }
}

/* ---------------- 一体化 hook:Media Session + 息屏守卫 ---------------- */

export interface BackplayOptions {
  /** 要托管的媒体元素(可能为 null:还没建 / 已销毁) */
  getEl: () => HTMLMediaElement | null;
  meta: () => NowPlayingMeta;
  handlers?: () => NowPlayingHandlers;
  /** 后台播放偏好;不传则每次事件时实时读取 localStorage */
  enabled?: boolean;
  /** 因为「不允许后台」而被自动暂停时触发(页面可提示一句) */
  onAutoPaused?: () => void;
}

/**
 * 给一个媒体元素挂上「锁屏控件 + 息屏守卫」。
 * - 元素每次 play 都会重新抢占 Media Session 并刷新元信息(切歌自动更新锁屏);
 * - 页面隐藏(document.hidden=息屏/切后台)且用户未开启后台播放 → 立刻暂停。
 */
export function useMediaBackplay(opts: BackplayOptions): void {
  const ownerRef = useRef<symbol | null>(null);
  if (ownerRef.current === null) ownerRef.current = Symbol('backplay');

  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const owner = ownerRef.current!;
    let refresh = () => {
      const o = optsRef.current;
      setNowPlaying(owner, o.meta(), o.handlers?.() || {}, { playbackState: 'playing' });
    };

    // 用捕获阶段监听:免去反复挂到 el 上、元素被换掉也能覆盖
    const belongToUs = (e: Event) => {
      const el = optsRef.current.getEl();
      return !!el && e.target === el;
    };
    const onPlay = (e: Event) => {
      if (!belongToUs(e)) return;
      refresh();
    };
    const onPause = (e: Event) => {
      if (!belongToUs(e)) return;
      setPlaybackState(owner, 'paused');
    };
    const onEnded = (e: Event) => {
      if (!belongToUs(e)) return;
      setPlaybackState(owner, 'none' as any);
    };
    let lastPos = 0;
    const onTime = (e: Event) => {
      if (!belongToUs(e)) return;
      const el = optsRef.current.getEl();
      if (!el) return;
      const now = Date.now();
      if (now - lastPos < 4000) return;
      lastPos = now;
      setPosition(owner, el.currentTime, el.duration || 0, el.playbackRate || 1);
    };

    window.addEventListener('play', onPlay, true);
    window.addEventListener('pause', onPause, true);
    window.addEventListener('ended', onEnded, true);
    window.addEventListener('timeupdate', onTime, true);

    return () => {
      window.removeEventListener('play', onPlay, true);
      window.removeEventListener('pause', onPause, true);
      window.removeEventListener('ended', onEnded, true);
      window.removeEventListener('timeupdate', onTime, true);
      clearNowPlaying(owner);
    };
  }, []);

  // 息屏/切后台守卫
  const enabled = opts.enabled;
  useEffect(() => {
    const checkHidden = () => {
      if (!document.hidden) return;
      const on = optsRef.current.enabled ?? backgroundPlayEnabled();
      if (on) return;
      const el = optsRef.current.getEl();
      if (el && !el.paused) {
        try {
          el.pause();
        } catch {
          /* ignore */
        }
        optsRef.current.onAutoPaused?.();
      }
    };
    const onVis = () => checkHidden();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [enabled]);

  // 用户在播放过程中把「后台播放」关掉且当前页面已不可见 → 立即停
  useEffect(() => {
    if (enabled !== false) return;
    if (!document.hidden) return;
    const el = optsRef.current.getEl();
    if (el && !el.paused) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      optsRef.current.onAutoPaused?.();
    }
  }, [enabled]);
}
