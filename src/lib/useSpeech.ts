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
  /** 该节正文之前额外播报的字数(如「第 3 节，」),仅用于时间估算,不占高亮索引 */
  lead?: number;
}

export interface SpeechOptions {
  lang?: string;
  /** 正文前先播报的标题(如「约翰福音 第 3 章」);为空则不播报 */
  leadText?: string | null;
  /** 是否在每个条目(经节)前播报序号 */
  announceKey?: boolean;
  /** 序号播报文案,默认「第 N 节」 */
  formatKey?: (key: number) => string;
  /**
   * 整段自然读完(而非被 stop/cancel/换内容打断)时触发一次。
   * 页面据此实现「读完自动下一章」——不要靠 speakingKey 是否到达最后一节判断,
   * 时间估算可能落后于真实朗读,最后一节的 key 未必被记录到。
   */
  onEnd?: () => void;
}

/**
 * 经文朗读(浏览器内置 TTS,无需联网)。
 *
 * 几个关键设计:
 * 1) 分批朗读:每 CHUNK_VERSES 节拼成一个 utterance,批末自动接下一批。
 *    既规避 Chromium「逐节朗读时每节首字被裁掉」的缺陷,又避免整章拼成
 *    超长 utterance(Chrome 对超长 utterance 有静默中断的已知问题)。
 * 2) 进度回传:实时维护「当前朗读到的节」(speakingKey)与「全局字符索引」
 *    (speakCharRef),页面据此实现逐节高亮 + 自动滚动 + 逐字高亮。
 * 3) 逐字高亮仅在语速 1.0x 时启用(wordSync):倍速下引擎的时间不再线性,
 *    逐字位置会明显漂移,此时只做整节(整行)高亮。
 */
const CHUNK_VERSES = 4;

export function useSpeech(items: SpeechItem[], options: SpeechOptions | string = {}) {
  const opts: SpeechOptions = typeof options === 'string' ? { lang: options } : options;
  const lang = opts.lang || 'zh-CN';
  const fallbackFormatKey = useCallback((k: number) => `第 ${k} 节`, []);
  const formatKey = opts.formatKey || fallbackFormatKey;

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

  // 服务端 TTS 兜底:无 speechSynthesis 时(如安卓微信 WebView)改用后端合成的音频播放
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState(false);
  const ttsMode: 'browser' | 'server' = supported ? 'browser' : 'server';

  const itemsRef = useRef<SpeechItem[]>(items);
  const rateRef = useRef(rate);
  const stoppedRef = useRef(false);
  const posRef = useRef(0);
  const boundarySeenRef = useRef(false);
  const rafRef = useRef(0);
  const pauseAtRef = useRef(0);
  // 代次:每次 start/stop/变速 +1,异步回调据此丢弃过期事件,避免串音
  const genRef = useRef(0);

  const leadTextRef = useRef<string | null>(opts.leadText ?? null);
  const announceKeyRef = useRef(!!opts.announceKey);
  const formatKeyRef = useRef(formatKey);
  const onEndRef = useRef<(() => void) | undefined>(opts.onEnd);
  useEffect(() => { leadTextRef.current = opts.leadText ?? null; }, [opts.leadText]);
  useEffect(() => { announceKeyRef.current = !!opts.announceKey; }, [opts.announceKey]);
  useEffect(() => { formatKeyRef.current = formatKey; }, [formatKey]);
  useEffect(() => { onEndRef.current = opts.onEnd; }, [opts.onEnd]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { rateRef.current = rate; }, [rate]);

  /** 逐字高亮只在 1.0x 开启 */
  const wordSync = rate === 1;

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

  // 时间估算所需上下文(中文 onboundary 多不触发,用节级时长推进兜底)
  const estRef = useRef<{
    t0: number;
    perChar: number;
    baseChar: number;
    spans: { key: number; start: number; end: number; lead?: number }[];
    total: number;
    wordSync: boolean;
  } | null>(null);

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
      const sp = est.spans[s];
      const segLen = sp.end - sp.start;
      const lead = sp.lead || 0;
      // 节号播报也占时间,但不占高亮索引
      const dur = (lead + segLen) * est.perChar;
      if (el < acc + dur || s === est.spans.length - 1) {
        const inSeg = Math.max(0, el - acc - lead * est.perChar);
        const p = segLen > 0 ? inSeg / (segLen * est.perChar) : 0;
        raw = sp.start + Math.max(0, Math.min(segLen, Math.floor(p * segLen)));
        done = true;
        break;
      }
      acc += dur;
      raw = sp.end;
    }
    if (!done) raw = est.baseChar + est.total;
    const maxRaw = est.baseChar + est.total;
    const cur = Math.max(0, Math.min(maxRaw, raw));
    // 非 1 倍速不做逐字同步(仅整节高亮),倍速下引擎时间不线性,逐字会漂移
    speakCharRef.current = est.wordSync ? cur : null;
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

  const pickVoice = useCallback((u: SpeechSynthesisUtterance) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const zh = voices.find((v) => (v.lang || '').toLowerCase().startsWith('zh'));
    if (zh) u.voice = zh;
  }, []);

  // 将 fromIndex 起的各节拼成一个 utterance 朗读。
  // withLead=true 且配置了 leadText 时,先单独播报标题,再读正文。
  const speakRange = useCallback(
    (fromIndex: number, withLead = false) => {
      if (!supported) return;
      const list = itemsRef.current;
      if (!list.length || fromIndex < 0 || fromIndex >= list.length) {
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        return;
      }
      const gen = genRef.current;
      const alive = () => !stoppedRef.current && genRef.current === gen;
      posRef.current = fromIndex;

      // ---- 标题播报(「约翰福音 第 3 章」) ----
      const lead = withLead ? (leadTextRef.current || '').trim() : '';
      if (lead) {
        setState('playing');
        speakingKeyRef.current = list[fromIndex].key;
        setSpeakingKey(list[fromIndex].key);
        speakCharRef.current = null;
        const lu = new SpeechSynthesisUtterance(lead);
        lu.lang = lang;
        lu.rate = rateRef.current;
        lu.volume = 1;
        pickVoice(lu);
        lu.onend = () => {
          if (!alive()) return;
          setTimeout(() => { if (alive()) speakRangeRef.current?.(fromIndex, false); }, 60);
        };
        lu.onerror = () => {
          if (!alive()) return;
          setTimeout(() => { if (alive()) speakRangeRef.current?.(fromIndex, false); }, 60);
        };
        window.speechSynthesis.speak(lu);
        return;
      }

      const endIdx = Math.min(list.length, fromIndex + CHUNK_VERSES);
      // 被跳过的节的总字数(全局偏移)
      let baseChar = 0;
      for (let k = 0; k < fromIndex; k++) {
        baseChar += Array.from((list[k].text || '').trim()).length;
      }
      // 拼接 [fromIndex, endIdx) 为单 utterance,并记录 tts 字符 -> 全局 raw 的映射
      const spans: { key: number; start: number; end: number; lead?: number }[] = [];
      const mapTtsToRaw: number[] = []; // 长度=buf.length,值为全局raw或-1(分隔符/播报词)
      let buf = '';
      for (let k = fromIndex; k < endIdx; k++) {
        const raw0 = baseChar + Array.from(buf).length; // 该节在全局的起始(raw)
        const chars = Array.from((list[k].text || '').trim());
        if (!chars.length) continue;
        let leadChars = 0;
        if (buf) {
          buf += '。'; // 节间用句号制造自然停顿(句号本身不发音)
          mapTtsToRaw.push(-1);
        }
        if (announceKeyRef.current) {
          const head = formatKeyRef.current(list[k].key) + '，';
          buf += head;
          leadChars = Array.from(head).length;
          for (let c = 0; c < leadChars; c++) mapTtsToRaw.push(-1);
        }
        buf += chars.join('');
        for (let c = 0; c < chars.length; c++) mapTtsToRaw.push(raw0 + c);
        spans.push({ key: list[k].key, start: raw0, end: raw0 + chars.length, lead: leadChars });
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
      pickVoice(u);
      const totalChars = spans.reduce((a, s) => a + (s.end - s.start), 0);
      const perChar = 230 / rateRef.current; // 中文约 230ms/字 @ rate=1
      const t0 = performance.now();
      const ws = rateRef.current === 1;
      speakCharRef.current = ws ? spans[0].start : null;

      u.onboundary = (e: SpeechSynthesisEvent) => {
        // 倍速下不做逐字同步,交给时间估算推进节级高亮
        if (!ws) return;
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
        if (!alive()) return;
        // 本批读完 → 自动接下一批(分批是为了避免超长 utterance 被浏览器静默掐断)
        if (endIdx < list.length) {
          posRef.current = endIdx;
          setTimeout(() => { if (alive()) speakRangeRef.current?.(endIdx); }, 60);
          return;
        }
        speakCharRef.current = null;
        speakingKeyRef.current = null;
        setState('idle');
        setSpeakingKey(null);
        // 自然读完(未停止、未被换章打断)→ 通知页面,用于「读完自动下一章」
        if (alive()) onEndRef.current?.();
      };
      u.onerror = () => {
        stopTick();
        if (!alive()) return;
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
        if (!alive()) return;
        window.speechSynthesis.speak(u);
        startTick({ t0, perChar, baseChar, spans, total: totalChars, wordSync: ws });
      }, 120);
    },
    [lang, supported, startTick, stopTick, stopRaf, syncSpeakingKey, pickVoice]
  );

  // 分批链式朗读时,下一批要从 onend 回调里再次调用 speakRange
  const speakRangeRef = useRef(speakRange);
  useEffect(() => { speakRangeRef.current = speakRange; }, [speakRange]);

  // ---- 服务端 TTS 兜底(无 speechSynthesis 时使用) ----
  // 拼出待合成文本,并返回每节在文本中的字符区间(用于播放进度高亮)
  const buildText = useCallback((fromIndex: number) => {
    const list = itemsRef.current;
    const spans: { key: number; start: number; end: number }[] = [];
    let buf = '';
    const lead = (leadTextRef.current || '').trim();
    if (lead) buf += lead + '。';
    const start = Math.max(0, Math.min(fromIndex, list.length - 1));
    for (let k = start; k < list.length; k++) {
      const it = list[k];
      if (buf && !buf.endsWith('。')) buf += '。';
      let head = '';
      if (announceKeyRef.current) head = formatKeyRef.current(it.key) + '，';
      const text = (it.text || '').trim();
      if (!Array.from(text).length) continue;
      const s = Array.from(buf).length;
      buf += head + text;
      const e = Array.from(buf).length;
      spans.push({ key: it.key, start: s, end: e });
    }
    return { text: buf, spans };
  }, []);

  const serverStopInner = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.src = ''; }
    audioRef.current = null;
  }, []);

  const serverStart = useCallback(async (fromKey?: number) => {
    const list = itemsRef.current;
    if (!list.length) return;
    stoppedRef.current = false;
    genRef.current += 1;
    let i = 0;
    if (fromKey != null) {
      const f = list.findIndex((it) => it.key === fromKey);
      if (f >= 0) i = f;
    }
    const { text, spans } = buildText(i);
    setTtsError(false);
    setTtsLoading(true);
    setState('playing');
    const gen = genRef.current;
    try {
      const res = await fetch('/api/v1/bible/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('tts_failed');
      const blob = await res.blob();
      if (stoppedRef.current || genRef.current !== gen) return; // 已停止/换章
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rateRef.current;
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (!audio.duration) return;
        const raw = Math.floor((audio.currentTime / audio.duration) * text.length);
        syncSpeakingKey(raw, spans);
      };
      audio.onerror = () => {
        serverStopInner();
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
      };
      audio.onended = () => {
        serverStopInner();
        if (!stoppedRef.current && genRef.current === gen) onEndRef.current?.();
      };
      await audio.play();
      setState('playing');
    } catch {
      serverStopInner();
      setState('idle');
      setSpeakingKey(null);
      speakCharRef.current = null;
      setTtsError(true);
    } finally {
      setTtsLoading(false);
    }
  }, [buildText, syncSpeakingKey, serverStopInner]);

  const serverPause = useCallback(() => {
    audioRef.current?.pause();
    setState('paused');
  }, []);

  const serverResume = useCallback(() => {
    audioRef.current?.play();
    setState('playing');
  }, []);

  const serverStop = useCallback(() => {
    stoppedRef.current = true;
    genRef.current += 1;
    serverStopInner();
    setState('idle');
    setSpeakingKey(null);
    speakCharRef.current = null;
  }, [serverStopInner]);

  const serverSetRate = useCallback((r: number) => {
    const v = Math.max(0.5, Math.min(2, r));
    setRateState(v);
    rateRef.current = v;
    if (audioRef.current) audioRef.current.playbackRate = v;
  }, []);

  /** 从头开始(或停止后从指定节重新开始) */
  const start = useCallback(
    (fromKey?: number) => {
      if (!supported) { serverStart(fromKey); return; }
      if (!itemsRef.current.length) return;
      stoppedRef.current = false;
      genRef.current += 1;
      speakingKeyRef.current = null;
      stopRaf();
      window.speechSynthesis.cancel();
      let i = 0;
      if (fromKey != null) {
        const found = itemsRef.current.findIndex((it) => it.key === fromKey);
        if (found >= 0) i = found;
      }
      speakRange(i, true);
    },
    [speakRange, supported, stopRaf, serverStart]
  );

  const pause = useCallback(() => {
    if (!supported) { serverPause(); return; }
    stopRaf();
    pauseAtRef.current = performance.now();
    window.speechSynthesis.pause();
    setState('paused');
  }, [supported, stopRaf, serverPause]);

  const resume = useCallback(() => {
    if (!supported) { serverResume(); return; }
    window.speechSynthesis.resume();
    setState('playing');
    // 补偿暂停时长,让时间估算继续准确(若该浏览器依赖估算兜底)
    if (estRef.current) {
      estRef.current.t0 += performance.now() - pauseAtRef.current;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [supported, tick, serverResume]);

  const stop = useCallback(() => {
    if (!supported) { serverStop(); return; }
    stopTick();
    stoppedRef.current = true;
    genRef.current += 1;
    speakCharRef.current = null;
    speakingKeyRef.current = null;
    window.speechSynthesis.cancel();
    setState('idle');
    setSpeakingKey(null);
  }, [supported, stopTick, serverStop]);

  const setRate = useCallback(
    (r: number) => {
      if (!supported) { serverSetRate(r); return; }
      const v = Math.max(0.5, Math.min(2, r));
      setRateState(v);
      rateRef.current = v;
      // 正在朗读时改语速:重启当前段落以生效
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const wasPlaying = state === 'playing' || state === 'paused';
        if (wasPlaying) {
          genRef.current += 1;
          window.speechSynthesis.cancel();
          stopTick();
          setTimeout(() => speakRange(posRef.current), 60);
        }
      }
    },
    [speakRange, state, stopTick, serverSetRate]
  );

  /** 切换章节 / 卸载时停止朗读 */
  useEffect(() => {
    return () => {
      stopRaf();
      stopTick();
      stoppedRef.current = true;
      genRef.current += 1;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    };
  }, [stopRaf, stopTick]);

  // 朗读内容变化(如换章)时自动停止
  useEffect(() => {
    stoppedRef.current = true;
    genRef.current += 1;
    stopTick();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    speakingKeyRef.current = null;
    setState('idle');
    setSpeakingKey(null);
    speakCharRef.current = null;
  }, [items, stopTick]);

  return {
    supported,
    /** 朗读引擎模式:browser=浏览器原生 TTS;server=后端合成音频(无 speechSynthesis 时) */
    ttsMode,
    /** 服务端合成中(首屏等待) */
    ttsLoading,
    /** 服务端合成失败(如微软 TTS 不可达),前端据此提示「请用 Chrome 打开」 */
    ttsError,
    state,
    speakingKey,
    rate,
    /** 是否启用逐字高亮(仅 1.0x 的浏览器模式) */
    wordSync,
    start,
    pause,
    resume,
    stop,
    setRate,
    segments,
    speakCharRef,
  };
}
