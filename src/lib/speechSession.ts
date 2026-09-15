'use client';

/**
 * 朗读会话总线。
 *
 * useSpeech 每个实例都是组件私有的 state,但「悬浮朗读卡」是全站共用的:
 * 切到别的页面后仍要能看到「正在朗读 xx」并暂停/停止。这里用一个极简订阅 store
 * 把当前朗读会话广播出来,谁在读谁负责 setSpeechSession(null) 收尾。
 */

import { useEffect, useState } from 'react';

export interface SpeechSession {
  /** 稳定的会话标识(同一段朗读在暂停/继续之间不变) */
  id: string;
  title: string;
  subtitle?: string;
  state: 'loading' | 'playing' | 'paused';
  /** 是否走 <audio> 播放(可后台);浏览器原生 speechSynthesis 息屏会被系统挂起 */
  backplayable: boolean;
  toggle: () => void;
  stop: () => void;
  /** 可选:跳回朗读所在页面 */
  href?: string;
}

let current: SpeechSession | null = null;
const subs = new Set<() => void>();

export function setSpeechSession(s: SpeechSession | null): void {
  current = s;
  for (const fn of Array.from(subs)) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getSpeechSession(): SpeechSession | null {
  return current;
}

/** 供音乐播放器调用:开播前先让朗读让位(两者同时出声没法听) */
export function stopSpeechSessionIfAny(): void {
  try {
    current?.stop();
  } catch {
    /* ignore */
  }
}

export function useSpeechSession(): SpeechSession | null {
  const [s, setS] = useState<SpeechSession | null>(() => current);
  useEffect(() => {
    const fn = () => setS(current);
    subs.add(fn);
    fn();
    return () => {
      subs.delete(fn);
    };
  }, []);
  return s;
}
