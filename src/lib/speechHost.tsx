'use client';

/**
 * 常驻朗读会话。
 *
 * 直接调用 useSpeech 时实例挂在页面组件里:一旦离开页面(哪怕只是点个链接),
 * 组件卸载就会把朗读掐掉。手机读经的实际用法是「开了朗读就去干别的」,
 * 所以这里把唯一的朗读实例提到根布局常驻(SpeechHostProvider),页面侧用
 * useHostedSpeech 提交内容 + 拿状态:
 *  - 用户点「朗读」时才 commit(items, opts),避免登个记就把别人正在读的挤掉;
 *  - 卸载不清理请求 → 换页 / 换章期间朗读持续进行,悬浮朗读卡一直可控制;
 *  - 没有 Provider 时(少数子树)自动降级为本地实例,行为与原先完全一致。
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSpeech, type SpeechApi, type SpeechItem, type SpeechOptions } from './useSpeech';

const EMPTY_ITEMS: SpeechItem[] = [];
const EMPTY_OPTS: SpeechOptions = {};

interface HostApi {
  commit: (items: SpeechItem[], opts: SpeechOptions) => void;
  speech: SpeechApi;
}

const Ctx = createContext<HostApi | null>(null);

/**
 * 极短静音 WAV:commit → useEffect → start 之间隔着一次渲染,
 * start 因此会落到 setTimeout 里、脱离用户手势。iOS / 微信里异步 play() 会被
 * 静默拒绝,所以这里先在点击的同步栈里播一段静音把音频通道解锁。
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
let unlocked = false;
function unlockGesture() {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  try {
    const a = new Audio(SILENT_WAV);
    const p = a.play();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function SpeechHostProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ items: SpeechItem[]; opts: SpeechOptions } | null>(null);
  const speech = useSpeech(req?.items ?? EMPTY_ITEMS, req?.opts ?? EMPTY_OPTS);
  const commit = useCallback((items: SpeechItem[], opts: SpeechOptions) => {
    setReq({ items, opts });
  }, []);
  const value = useMemo<HostApi>(() => ({ commit, speech }), [commit, speech]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 页面侧用法与 useSpeech 完全一致,只是朗读实例常驻、离开页面不会被掐掉 */
export function useHostedSpeech(
  items: SpeechItem[],
  options: SpeechOptions | string = {},
): SpeechApi {
  const opts: SpeechOptions = typeof options === 'string' ? { lang: options } : options;
  // 降级用实例:没有 Provider 时它才真的上场;有 Provider 时永久静默(不碰 speechSynthesis、不广播)
  const ctx = useContext(Ctx);
  const local = useSpeech(items, ctx ? { ...opts, silent: true } : options);

  const ctxRef = useRef<HostApi | null>(null);
  ctxRef.current = ctx;
  const contentRef = useRef<{ items: SpeechItem[]; opts: SpeechOptions }>({ items, opts });
  contentRef.current = { items, opts };

  const start = useCallback((fromKey?: number) => {
    const host = ctxRef.current;
    if (!host) {
      local.start(fromKey);
      return;
    }
    // 先解锁音频(同步栈),再提交内容,最后在下一轮调度里真正开读
    unlockGesture();
    host.commit(contentRef.current.items, contentRef.current.opts);
    setTimeout(() => {
      if (ctxRef.current !== host) return;
      host.speech.start(fromKey);
    }, 0);
  }, [local]);

  return useMemo<SpeechApi>(() => {
    if (!ctx) return local;
    return { ...ctx.speech, start };
  }, [ctx, local, start]);
}
