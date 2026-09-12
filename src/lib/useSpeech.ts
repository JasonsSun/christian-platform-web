'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpeechItem {
  /** 用于高亮定位的序号(如经节号) */
  key: number;
  /** 要朗读的文本 */
  text: string;
}

export type SpeechState = 'idle' | 'playing' | 'paused';

export interface SpeechSegment {
  /** 该节在「全局字符空间」中的起始索引(含前面所有节) */
  start: number;
  /** 结束索引(不含) */
  end: number;
}

/**
 * 经文朗读(浏览器内置 TTS,无需联网)。
 *
 * 两个关键设计:
 * 1) 分批朗读:每 CHUNK_VERSES 节拼成一个 utterance,批末自动接下一批。
 *    既规避 Chromium「逐节朗读时每节首字被裁掉」的缺陷,又避免整章拼成
 *    超长 utterance(Chrome 对超长 utterance 有静默中断的已知问题)。
 * 2) 进度回传:实时维护「当前朗读到的节」(speakingKey)与「全局字符索引」
 *    (speakCharRef),页面据此实现逐节高亮 + 自动滚动 + 逐字高亮。
 */
const CHUNK_VERSES = 4;

export function useSpeech(items: SpeechItem[], lang = 'zh-CN') {
  const [speakingKey, setSpeakingKey] = useState<number | null>(null);
  const [state, setState] = useState<SpeechState>('idle');
  const [rate, setRateState] = useState(1);
  // 与 speakingKey 同步的 ref,用于高频进度更新时判断是否真换节(避免多余重渲)
  const speakingKeyRef = useRef<number | null>(null);
  // 每节在全局字符空间中的区间,供页面把单字映射成全局索引做逐字高亮
  const [segments, setSegments] = useState<Record<number, SpeechSegment>>({});
  // 当前朗读到的全局字符索引(实时,经 ref 暴露以避免逐字重渲整棵树)
  const speakCharRef = useRef<number | null>(null);

  const supported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const itemsRef = useRef<SpeechItem[]>(items);
  const rateRef = useRef(rate);
  const stoppedRef = useRef(false);
  const posRef = useRef(0);
  const boundarySeenRef = useRef(false);
  const rafRef = useRef(0);
  const pauseAtRef = useRef(0);

  // 时间估算所需上下文(中文 onboundary 多不触发,用节级时长推进兜底)
  const estRef = useRef<{
    t0: number;
    perChar: number;
    baseChar: number;
    spans: { key: number; start: number; end: number }[];
    total: number;
  } | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { rateRef.current = rate; }, [rate]);

  // 由 items 预计算每节全局字符区间(与是否正在朗读无关)
  useEffect(() => {
    const seg: Record<number, SpeechSegment> = {};
    let raw = 0;
    for (const it of items) {
      const t = Array.from((it.text || '').trim());
      seg[it.key] = { start: raw, end: raw + t.length };
      raw += t.length;
    }
    setSegments(seg);
  }, [items]);

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  /** 朗读进度推进到哪一节就高亮哪一节(页面据此自动滚动到当前节) */
  const syncSpeakingKey = useCallback(
    (raw: number, spans: { key: number; start: number; end: number }[]) => {
      let k: number | null = null;
      for (const s of spans) {
        if (raw >= s.start && raw < s.end) { k = s.key; break; }
      }
      if (k == null) return;
      if (k !== speakingKeyRef.current) {
        speakingKeyRef.current = k;
        setSpeakingKey(k);
      }
    },
    []
  );

  // 时间估算 tick:根据已用时间推算当前全局字符索引(节边界对齐,避免跨节漂移)
  const tick = useCallback(() => {
    const est = estRef.current;
    if (!est || boundarySeenRef.current) return;
    const el = performance.now() - est.t0;
    let acc = 0;
    let raw = est.baseChar;
    let done = false;
    for (let s = 0; s < est.spans.length; s++) {
      const segLen = est.spans[s].end - est.spans[s].start;
      const dur = segLen * est.perChar;
      if (el < acc + dur || s === est.spans.length - 1) {
        const p = dur > 0 ? (el - acc) / dur : 0;
        raw = est.spans[s].start + Math.min(segLen, Math.floor(p * segLen));
        done = true;
        break;
      }
      acc += dur;
      raw = est.spans[s].end;
    }
    if (!done) raw = est.baseChar + est.total;
    const maxRaw = est.baseChar + est.total;
    const cur = Math.max(0, Math.min(maxRaw, raw));
    speakCharRef.current = cur;
    syncSpeakingKey(cur, est.spans);
    rafRef.current = requestAnimationFrame(tick);
  }, [syncSpeakingKey]);

  const startTick = useCallback(
    (est: NonNullable<typeof estRef.current>) => {
      estRef.current = est;
      stopRaf();
      boundarySeenRef.current = false;
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopRaf, tick]
  );

  const stopTick = useCallback(() => {
    stopRaf();
    estRef.current = null;
  }, [stopRaf]);

  // 将 fromIndex 起的各节拼成一个 utterance 朗读。
  const speakRange = useCallback(
    (fromIndex: number) => {
      if (!supported) return;
      const list = itemsRef.current;
      if (!list.length || fromIndex < 0 || fromIndex >= list.length) {
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        return;
      }
      posRef.current = fromIndex;
      const endIdx = Math.min(list.length, fromIndex + CHUNK_VERSES);
      // 被跳过的节的总字数(全局偏移)
      let baseChar = 0;
      for (let k = 0; k < fromIndex; k++) {
        baseChar += Array.from((list[k].text || '').trim()).length;
      }
      // 拼接 [fromIndex, endIdx) 为单 utterance,并记录 tts 字符 -> 全局 raw 的映射
      const spans: { key: number; start: number; end: number }[] = [];
      const mapTtsToRaw: number[] = []; // 长度=buf.length,值为全局raw或-1(分隔符)
      let buf = '';
      for (let k = fromIndex; k < endIdx; k++) {
        const raw0 = baseChar + Array.from(buf).length; // 该节在全局的起始(raw)
        const chars = Array.from((list[k].text || '').trim());
        if (!chars.length) continue;
        if (buf) {
          buf += '。'; // 节间用句号制造自然停顿(句号本身不发音)
          mapTtsToRaw.push(-1);
        }
        buf += chars.join('');
        for (let c = 0; c < chars.length; c++) mapTtsToRaw.push(raw0 + c);
        spans.push({ key: list[k].key, start: raw0, end: raw0 + chars.length });
      }
      if (!spans.length) {
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        return;
      }
      speakingKeyRef.current = spans[0].key;
      setSpeakingKey(spans[0].key);
      const u = new SpeechSynthesisUtterance(buf);
      u.lang = lang;
      u.rate = rateRef.current;
      u.volume = 1;
      // 显式挑选中文语音,避免某些浏览器默认选中英文 voice
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        const zh = voices.find((v) => (v.lang || '').toLowerCase().startsWith('zh'));
        if (zh) u.voice = zh;
      }
      const totalChars = mapTtsToRaw.length;
      const perChar = 230 / rateRef.current; // 中文约 230ms/字 @ rate=1
      const t0 = performance.now();
      speakCharRef.current = spans[0].start;

      u.onboundary = (e: SpeechSynthesisEvent) => {
        const idx = e.charIndex;
        if (idx >= 0 && idx < mapTtsToRaw.length) {
          const r = mapTtsToRaw[idx];
          if (r >= 0) {
            speakCharRef.current = r;
            syncSpeakingKey(r, spans);
            boundarySeenRef.current = true; // 引擎给出真实进度,停止时间估算
            stopRaf();
          }
        }
      };
      u.onend = () => {
        stopTick();
        if (stoppedRef.current) return;
        // 本批读完 → 自动接下一批(分批是为了避免超长 utterance 被浏览器静默掐断)
        if (endIdx < list.length) {
          posRef.current = endIdx;
          setTimeout(() => {
            if (!stoppedRef.current) speakRangeRef.current?.(endIdx);
          }, 60);
          return;
        }
        speakCharRef.current = null;
        speakingKeyRef.current = null;
        setState('idle');
        setSpeakingKey(null);
      };
      u.onerror = () => {
        stopTick();
        speakCharRef.current = null;
        speakingKeyRef.current = null;
        setState('idle');
        setSpeakingKey(null);
      };

      // 静默预热引擎:Chromium 首次/冷启动时会在首句开头裁掉几个字。
      // 先播放一个 volume=0、rate=10 的空 utterance 触发引擎完整初始化,后续真正的朗读就不会被吞首字。
      // 该预热完全无声,且处于用户点击的交互链内(有激活),浏览器不会拒绝。
      const warm = new SpeechSynthesisUtterance('');
      warm.volume = 0;
      warm.rate = 10;
      warm.lang = lang;
      window.speechSynthesis.speak(warm);
      setState('playing');
      // 预热后稍等再 speak 整段,确保引擎已就绪;随后启动时间估算兜底
      setTimeout(() => {
        window.speechSynthesis.speak(u);
        startTick({ t0, perChar, baseChar, spans, total: totalChars });
      }, 120);
    },
    [lang, supported, startTick, stopTick, stopRaf, syncSpeakingKey]
  );

  // 分批链式朗读时,下一批要从 onend 回调里再次调用 speakRange
  const speakRangeRef = useRef(speakRange);
  useEffect(() => { speakRangeRef.current = speakRange; }, [speakRange]);

  /** 从头开始(或停止后从指定节重新开始) */
  const start = useCallback(
    (fromKey?: number) => {
      if (!supported || !itemsRef.current.length) return;
      stoppedRef.current = false;
      speakingKeyRef.current = null;
      stopRaf();
      window.speechSynthesis.cancel();
      let i = 0;
      if (fromKey != null) {
        const found = itemsRef.current.findIndex((it) => it.key === fromKey);
        if (found >= 0) i = found;
      }
      speakRange(i);
    },
    [speakRange, supported, stopRaf]
  );

  const pause = useCallback(() => {
    if (!supported) return;
    stopRaf();
    pauseAtRef.current = performance.now();
    window.speechSynthesis.pause();
    setState('paused');
  }, [supported, stopRaf]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setState('playing');
    // 补偿暂停时长,让时间估算继续准确(若该浏览器依赖估算兜底)
    if (estRef.current) {
      estRef.current.t0 += performance.now() - pauseAtRef.current;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [supported, tick]);

  const stop = useCallback(() => {
    if (!supported) return;
    stopTick();
    stoppedRef.current = true;
    speakCharRef.current = null;
    speakingKeyRef.current = null;
    window.speechSynthesis.cancel();
    setState('idle');
    setSpeakingKey(null);
  }, [supported, stopTick]);

  const setRate = useCallback(
    (r: number) => {
      const v = Math.max(0.5, Math.min(2, r));
      setRateState(v);
      rateRef.current = v;
      // 正在朗读时改语速:重启当前段落以生效
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const wasPlaying = state === 'playing' || state === 'paused';
        if (wasPlaying) {
          window.speechSynthesis.cancel();
          stopTick();
          setTimeout(() => speakRange(posRef.current), 60);
        }
      }
    },
    [speakRange, state, stopTick]
  );

  /** 切换章节 / 卸载时停止朗读 */
  useEffect(() => {
    return () => {
      stopRaf();
      stopTick();
      stoppedRef.current = true;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopRaf, stopTick]);

  // 朗读内容变化(如换章)时自动停止
  useEffect(() => {
    stoppedRef.current = true;
    stopTick();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    speakingKeyRef.current = null;
    setState('idle');
    setSpeakingKey(null);
    speakCharRef.current = null;
  }, [items, stopTick]);

  return {
    supported,
    state,
    speakingKey,
    rate,
    start,
    pause,
    resume,
    stop,
    setRate,
    segments,
    speakCharRef,
  };
}
