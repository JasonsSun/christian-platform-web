'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string | null;
  poster?: string | null;
  live?: boolean;
  className?: string;
}

/** 网页 HLS 播放器:Chrome/Firefox 用 hls.js,Safari 走原生 HLS。
 *  主播未推流时显示「等待直播信号」。
 *
 *  健壮性说明:MediaMTX 在长时间无观众后,首个 HLS 连接可能因切片尚未就绪
 *  触发一次 DEMUXER_ERROR_COULD_NOT_PARSE(实测:第二次连接即正常)。
 *  因此这里在致命媒体错误时自动重建 hls 实例重试,而不是卡在错误态。
 *
 *  直播「重播旧内容」修复:
 *  手机断流重连 / 首帧缓冲时,hls.js 会从播放窗口开头播起,观众听到的其实是
 *  几十秒甚至几分钟前说过的话(表现为"一直在重复之前的内容")。
 *  对策:① 限制后向缓冲,② liveSyncMode='edge',③ MANIFEST_PARSED 后主动
 *  seek 到 seekable 末尾,④ 每 3 秒检测落后幅度,超过 10 秒给出「跳到最新」按钮。 */
export function HlsPlayer({ src, poster, live, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'waiting' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [behindSec, setBehindSec] = useState(0);
  const attemptRef = useRef(0);

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
        if (Number.isFinite(end) && v.currentTime < end - 2) {
          v.currentTime = Math.max(0, end - 0.5);
        }
      } catch { /* ignore */ }
    };

    const onPlaying = () => setState('playing');
    const onWaiting = () => setState('waiting');

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
      // 后向缓冲压到 10s 并贴住直播边缘,避免断流重连后一直播旧片段。
      hls = new Hls({
        lowLatencyMode: false,
        liveSyncMode: 'edge',
        liveSyncDurationCount: 2,
        backBufferLength: 10,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
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

    // 落后检测:直播中若落后可 seek 末端超过 10 秒,给出一键追帧入口
    if (live) {
      driftTimer = setInterval(() => {
        try {
          const v = video;
          if (!v || v.paused || !v.seekable || v.seekable.length === 0) { setBehindSec(0); return; }
          const end = v.seekable.end(v.seekable.length - 1);
          const behind = end - v.currentTime;
          setBehindSec(behind > 10 ? Math.round(behind) : 0);
        } catch { /* ignore */ }
      }, 3000);
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
      video.removeEventListener('error', onError);
      if (hls) { hls.destroy(); hls = null; }
    };
  }, [src, attempt]);

  const jumpToLive = () => {
    const v = videoRef.current;
    if (!v || !v.seekable || v.seekable.length === 0) return;
    try {
      v.currentTime = Math.max(0, v.seekable.end(v.seekable.length - 1) - 0.5);
      v.play().catch(() => {});
      setBehindSec(0);
    } catch { /* ignore */ }
  };

  return (
    <div className={`relative bg-black rounded-2xl overflow-hidden ${className || ''}`}>
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black"
        controls
        muted
        playsInline
        poster={poster || undefined}
      />
      {behindSec > 10 && state === 'playing' && (
        <button
          className="absolute bottom-16 right-3 z-10 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs shadow-lg hover:bg-rose-700"
          onClick={jumpToLive}
        >
          ⏩ 跳到最新（落后 {behindSec}s）
        </button>
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
                {state === 'loading' ? '正在连接直播信号…' : '等待主播开始推流…'}
              </p>
              {live && <p className="text-white/50 text-xs">直播即将开始,请稍候</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
