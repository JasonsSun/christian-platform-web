'use client';

import { useEffect, useRef, useState } from 'react';
import { useBackgroundPlay, useMediaBackplay } from '@/lib/backplay';
import { IconArrowRight, IconExpand, IconSpeaker, IconSpeakerOff } from '@/components/icons';

interface Props {
  src: string | null;
  poster?: string | null;
  live?: boolean;
  className?: string;
}

/** HLS 播放窗口大小,需与 deploy/mediamtx.yml 的 hlsSegmentCount 保持一致。
 *  超过该值仍落后即判定为「在播旧内容」,自动追到直播边缘。 */
const LIVE_WINDOW_SEC = 8;

/** 网页 HLS 播放器:Chrome/Firefox 用 hls.js,Safari 走原生 HLS。
 *  主播未开播时显示「等待主播开播…」。
 *
 *  健壮性说明:MediaMTX 在长时间无观众后,首个 HLS 连接可能因切片尚未就绪
 *  触发一次 DEMUXER_ERROR_COULD_NOT_PARSE(实测:第二次连接即正常)。
 *  因此这里在致命媒体错误时自动重建 hls 实例重试,而不是卡在错误态。
 *
 *  直播(live=true)行为约束 —— 直播不是点播:
 *  ① 隐藏原生 <video controls>,改用自绘控制条:不可暂停、不可拖动进度条
 *     (用户暂停后再播放,会从暂停处继续播缓冲里的旧分片,表现就是
 *     「一直在重复之前说过的话」)。
 *  ② 监听 pause 事件自动恢复播放;右键菜单禁用。
 *  ③ 限制后向缓冲 + liveSyncMode='edge' + 落后超过直播窗口自动追到边缘。 */
export function HlsPlayer({ src, poster, live, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'waiting' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [behindSec, setBehindSec] = useState(0);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const attemptRef = useRef(0);

  // 后台播放:直播/视频在息屏后继续出声,锁屏画面显示同一份元信息
  const bg = useBackgroundPlay();
  const metaRef = useRef<{ src: string | null; poster?: string | null }>({ src, poster });
  metaRef.current = { src, poster };
  useMediaBackplay({
    getEl: () => videoRef.current,
    meta: () => ({
      title: '正在直播',
      artist: '圣约社区 · 直播',
      album: '圣约社区',
      artwork: metaRef.current.poster ? [metaRef.current.poster] : [],
    }),
    handlers: () => ({
      play: () => { void videoRef.current?.play().catch(() => {}); },
      pause: () => { if (!live) videoRef.current?.pause(); },
    }),
    enabled: bg.enabled,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setState('waiting');
      return;
    }
    setState('loading');
    let hls: any = null;
    let cancelled = false;
    let driftTimer: any = null;

    /** 跳到直播边缘(可安全 seek 区间的末尾) */
    const seekToLiveEdge = () => {
      try {
        const v = video;
        if (!v || !v.seekable || v.seekable.length === 0) return;
        const end = v.seekable.end(v.seekable.length - 1);
        if (Number.isFinite(end) && v.currentTime < end - 1) {
          v.currentTime = Math.max(0, end - 0.5);
        }
      } catch { /* ignore */ }
    };

    const onPlaying = () => setState('playing');
    const onWaiting = () => setState('waiting');

    // 直播不允许暂停:用户暂停后再播放会从暂停处继续播缓冲区里的旧分片,
    // 造成「重复播放之前说过的话」。故检测到暂停立即恢复。
    const onPause = () => {
      if (!live || cancelled) return;
      // 息屏/切后台导致的暂停不要抢着恢复:用户在「后台播放」里选了「息屏即停」就该停
      if (typeof document !== 'undefined' && document.hidden) return;
      video.play().catch(() => {});
    };

    // 视频元素级错误(如 MSE 解复用失败 DEMUXER_ERROR_COULD_NOT_PARSE)。
    // hls.js 对此未必抛出 fatal 错误,故直接在 video 元素上兜底监听并重建实例重试。
    const onError = () => {
      if (attemptRef.current < 3) {
        attemptRef.current += 1;
        setState('waiting');
        setTimeout(() => setAttempt((n) => n + 1), 1500);
      } else {
        setState('error');
        setErrMsg('播放出错,请刷新重试');
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);

    const tryPlay = () => { video.play().catch(() => {}); };

    // hls.js 体积较大(~190KB),改为运行时按需加载:不进入首屏 bundle,
    // 只在真正需要 HLS 软解(非 Safari)时才下载。
    const setup = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS 原生 HLS:完全不需要 hls.js
        video.src = src;
        video.addEventListener('loadedmetadata', () => { setState('loading'); if (live) setTimeout(seekToLiveEdge, 500); });
        tryPlay();
        return;
      }

      const mod = await import('hls.js');
      if (cancelled) return;
      const Hls = mod.default;

      if (!Hls.isSupported()) {
        setState('error');
        setErrMsg('当前浏览器不支持 HLS 播放');
        return;
      }

      // MediaMTX 使用 mpegts 变体(非 LL-HLS),故关闭 lowLatencyMode。
      // 后向缓冲压到 4s 并贴住直播边缘,避免断流重连后一直播旧片段。
      hls = new Hls({
        lowLatencyMode: false,
        liveSyncMode: 'edge',
        liveSyncDurationCount: 2,
        backBufferLength: 4,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { tryPlay(); if (live) setTimeout(seekToLiveEdge, 500); });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;

        // 网络错误(推流未开始/抖动):重新拉取
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setState('waiting');
          hls?.startLoad();
          return;
        }

        // 媒体错误(如首个连接偶发的 DEMUXER_ERROR_COULD_NOT_PARSE):
        // 自动重建实例重试;超过上限后再退化为 recoverMediaError()。
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setState('waiting');
          if (attemptRef.current < 3) {
            attemptRef.current += 1;
            setTimeout(() => setAttempt((n) => n + 1), 1200);
          } else {
            try { hls?.recoverMediaError(); } catch { hls?.startLoad(); }
          }
          return;
        }

        setState('error');
        setErrMsg('播放出错,请刷新重试');
      });
    };

    // 直播落后检测:超过一个播放窗口仍在播旧分片,自动追到直播边缘。
    // (断流重连 / 首帧缓冲 / 页面长时间挂在后台都会造成落后。)
    if (live) {
      driftTimer = setInterval(() => {
        try {
          const v = video;
          if (!v || !v.seekable || v.seekable.length === 0) { setBehindSec(0); return; }
          const end = v.seekable.end(v.seekable.length - 1);
          const behind = end - v.currentTime;
          if (behind > LIVE_WINDOW_SEC) {
            setBehindSec(Math.round(behind));
            seekToLiveEdge();
            if (v.paused) v.play().catch(() => {});
          } else {
            setBehindSec(0);
          }
        } catch { /* ignore */ }
      }, 2000);
    }

    setup().catch(() => {
      if (!cancelled) {
        setState('error');
        setErrMsg('播放器加载失败,请刷新重试');
      }
    });

    return () => {
      cancelled = true;
      if (driftTimer) clearInterval(driftTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      if (hls) { hls.destroy(); hls = null; }
    };
  }, [src, attempt, live]);

  /** 手动追帧(自动追赶失败时的兜底入口) */
  const jumpToLive = () => {
    const v = videoRef.current;
    if (!v || !v.seekable || v.seekable.length === 0) return;
    try {
      v.currentTime = Math.max(0, v.seekable.end(v.seekable.length - 1) - 0.5);
      v.play().catch(() => {});
      setBehindSec(0);
    } catch { /* ignore */ }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    if (!next && v.volume === 0) { v.volume = 1; setVolume(1); }
    setMuted(next);
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen?.();
    } catch { /* ignore */ }
  };

  return (
    <div className={`relative bg-black rounded-2xl overflow-hidden ${className || ''}`}>
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black"
        // 直播不给原生控制条:不允许暂停/拖动进度条(回放录像时保留原生控件)
        controls={!live}
        muted
        playsInline
        tabIndex={live ? -1 : 0}
        poster={poster || undefined}
        onContextMenu={live ? (e) => e.preventDefault() : undefined}
      />

      {/* 直播自绘控制条:只有音量 / 追帧 / 全屏,没有暂停与进度条 */}
      {live && state === 'playing' && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
          <span className="flex items-center gap-1.5 text-white text-xs font-medium shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            直播中
          </span>
          {behindSec > 0 && (
            <button
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] hover:bg-rose-700 shrink-0 min-h-[44px] md:min-h-0"
              onClick={jumpToLive}
            >
              <IconArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              跳到最新
            </button>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              className="inline-flex h-11 w-11 md:h-8 md:w-8 items-center justify-center text-white hover:text-rose-300"
              onClick={toggleMute}
              title={muted ? '取消静音' : '静音'}
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <IconSpeakerOff className="w-4 h-4" strokeWidth={1.8} /> : <IconSpeaker className="w-4 h-4" strokeWidth={1.8} />}
            </button>
            <input
              aria-label="音量"
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="w-20 accent-rose-500"
              title="音量"
            />
            <button
              className="inline-flex h-11 w-11 md:h-8 md:w-8 items-center justify-center text-white hover:text-rose-300"
              onClick={toggleFullscreen}
              title="全屏"
              aria-label="全屏"
            >
              <IconExpand className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      {state !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center px-4">
          {state === 'error' ? (
            <p className="text-rose-200 text-sm">{errMsg}</p>
          ) : (
            <>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
              </span>
              <p className="text-white/90 text-sm">
                {state === 'loading' ? '正在连接直播…' : '等待主播开播…'}
              </p>
              {live && <p className="text-white/50 text-xs">直播即将开始,请稍候</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
