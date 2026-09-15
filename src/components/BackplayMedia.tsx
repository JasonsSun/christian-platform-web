'use client';

import { useRef } from 'react';
import { useBackgroundPlay, useMediaBackplay } from '@/lib/backplay';

/**
 * 带后台播放能力的原生 <video> / <audio>。
 * 文章内容里内嵌的媒体用它替换裸标签,这样息屏后还能继续听,
 * 锁屏画面也能显示标题(见 @/lib/backplay)。
 */
export default function BackplayMedia({
  kind,
  src,
  poster,
  title,
  className = '',
}: {
  kind: 'video' | 'audio';
  src: string;
  poster?: string;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement | null>(null);
  const bg = useBackgroundPlay();
  useMediaBackplay({
    getEl: () => ref.current,
    meta: () => ({
      title: title || '媒体播放',
      artist: '圣约社区',
      artwork: poster ? [poster] : [],
    }),
    handlers: () => ({
      play: () => { void ref.current?.play().catch(() => {}); },
      pause: () => ref.current?.pause(),
      seekBy: (d: number) => {
        const el = ref.current;
        if (el) el.currentTime = Math.max(0, Math.min(el.currentTime + d, el.duration || Infinity));
      },
    }),
    enabled: bg.enabled,
  });

  return kind === 'video' ? (
    <video ref={ref as any} src={src} poster={poster} controls playsInline preload="metadata" className={className} />
  ) : (
    <audio ref={ref as any} src={src} controls preload="metadata" className={className} />
  );
}
