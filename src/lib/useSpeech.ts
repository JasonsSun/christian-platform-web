'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { splitBySentence, baiduTtsUrl } from './ttsSplit';
import { useBackgroundPlay, useMediaBackplay } from './backplay';
import { setSpeechSession, getSpeechSession } from './speechSession';
import { useMaybePlayer } from './player';

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
  /** 锁屏控件上显示的标题(如「约翰福音 第 3 章」);缺省时用站点名 */
  mediaTitle?: string;
  /** 锁屏控件上显示的副标题(如版本名);缺省留空 */
  mediaSubtitle?: string;
  /** 悬浮朗读卡上的「回到此处」链接 */
  mediaHref?: string;
  /**
   * 静默模式:只作为 useHostedSpeech 的兜底实例存在(实际朗读由常驻会话接管),
   * 不广播朗读会话、不在 items 变化时调用 speechSynthesis.cancel()(否则会误掐掉常驻朗读)。
   */
  silent?: boolean;
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
 * 4) 服务端 TTS 兜底:无 speechSynthesis 时(安卓微信 WebView 等)请求后端合成音频。
 *    这条链路**必须有超时**——历史上后端因微软 TTS 建连挂起而永不返回,
 *    前端就一直停在「合成中…」,所以这里加了 AbortController 硬超时。
 * 5) 浏览器直连兜底:服务端全部 TTS 源都不可用(云机房 IP 被风控/出境被丢包)时,
 *    改由**浏览器自己**请求同一免密钥接口——请求来自用户网络,通常能通。
 *    这是"无论如何都能听"的最后一道防线。
 */
const CHUNK_VERSES = 4;

/** 服务端合成请求的硬超时(含 mid-tier 代理不返回的情况) */
const TTS_FETCH_TIMEOUT_MS = 45000;

/** 浏览器直连兜底的分段字数:URL 会把中文 3 倍编码,取小值避免超长 URL */
const CLIENT_SEG_CHARS = 200;

/**
 * 这些错误码说明「这台设备的语音引擎根本发不出声」,
 * 必须切到服务端合成;interrupted/canceled 是我们主动取消,属正常流程。
 */
const FATAL_TTS_ERRORS = new Set([
  'synthesis-failed',
  'synthesis-unavailable',
  'language-unavailable',
  'voice-unavailable',
  'audio-busy',
  'audio-hardware',
]);
function isFatalTtsError(code?: string) {
  return !!code && FATAL_TTS_ERRORS.has(code);
}

export type SpeechApi = ReturnType<typeof useSpeech>;

export function useSpeech(items: SpeechItem[], options: SpeechOptions | string = {}) {
  const opts: SpeechOptions = typeof options === 'string' ? { lang: options } : options;
  const silent = !!opts.silent;
  const lang = opts.lang || 'zh-CN';
  const fallbackFormatKey = useCallback((k: number) => `第 ${k} 节`, []);
  const formatKey = opts.formatKey || fallbackFormatKey;
  // 后台播放偏好:开启时朗读强制走服务端合成音频(<audio>),息屏才能继续出声
  const bg = useBackgroundPlay();
  // 全局音乐播放器(可能不在 Provider 内,此时为 null);朗读与音乐互斥
  const maybePlayer = useMaybePlayer();

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
  // 正在飞行中的合成请求,停止/换章/卸载时需要 abort,避免它继续占用连接
  const abortRef = useRef<AbortController | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState(false);
  // 实际合成来源(edge/baidu/cache/client),由响应头回传,便于排障与提示
  const [ttsProvider, setTtsProvider] = useState<string | null>(null);
  // 浏览器直连兜底:已就绪但自动播放被拦,等用户点一下
  const [clientReady, setClientReady] = useState(false);
  // 浏览器原生 TTS 被证明发不出声(系统无中文语音 / 引擎静默失败)时置 true,后续一律走服务端合成
  const [browserBroken, setBrowserBroken] = useState(false);
  // 用户手动强制使用服务端语音(浏览器有声音但发音差 / 缺中文语音时用)
  const [forceServer, setForceServer] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  // 当前用于朗读的音频元素(服务端合成 / 浏览器直连兜底都用它)。
  // 挂到 Media Session 上后,息屏时锁屏画面就有标题与播放控件。
  const [mediaEl, setMediaEl] = useState<HTMLAudioElement | null>(null);
  const mediaElRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { mediaElRef.current = mediaEl; }, [mediaEl]);

  const ttsMode: 'browser' | 'server' =
    supported && !browserBroken && !forceServer && !bg.enabled ? 'browser' : 'server';

  const itemsRef = useRef<SpeechItem[]>(items);
  const rateRef = useRef(rate);
  const stoppedRef = useRef(false);
  const posRef = useRef(0);
  const boundarySeenRef = useRef(false);
  const rafRef = useRef(0);
  const pauseAtRef = useRef(0);
  // 代次:每次 start/stop/变速 +1,异步回调据此丢弃过期事件,避免串音
  const genRef = useRef(0);
  // 是否已从「服务端语音」回落到「本机语音」。服务端链路不可用时只能回落一次,
  // 否则 服务端失败→浏览器→看门狗判定无声→又是服务端 会来回打转。
  const fellBackRef = useRef(false);

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

  /**
   * 显式挑选中文语音。
   * 关键:很多机器(精简版 Windows / 部分安卓 WebView)根本没装中文语音,
   * 此时 speak() 不报错、不触发 onerror,就是**完全没声音**。
   * 所以这里把"能否找到中文语音"作为浏览器引擎可用性的判据返回。
   */
  const pickVoice = useCallback((u: SpeechSynthesisUtterance) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    let voices: SpeechSynthesisVoice[] = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
    if (!voices.length) return false; // 语音表还没加载完,不算"无中文语音"
    const zh =
      voices.find((v) => /^zh(-|_)?/i.test(v.lang || '')) ||
      voices.find((v) => /^cmn|^yue/i.test(v.lang || '')) ||
      voices.find((v) => /chinese|中文|普通话/i.test(v.name || ''));
    if (zh) {
      u.voice = zh;
      setVoiceName(zh.name || zh.lang);
      return true;
    }
    return false;
  }, []);

  // 语音表是异步加载的(Chrome 首次为空),这里等它就绪再判断
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      try {
        const vs = window.speechSynthesis.getVoices() || [];
        if (vs.length) {
          const zh = vs.find((v) => /^zh(-|_)?/i.test(v.lang || ''));
          setVoiceName(zh ? zh.name || zh.lang : null);
          // 一个中文语音都没有 → 直接判定浏览器引擎不可用,避免"点了没声音"
          if (!zh) setBrowserBroken(true);
        }
      } catch { /* ignore */ }
    };
    load();
    try { window.speechSynthesis.addEventListener('voiceschanged', load); } catch { /* ignore */ }
    const t = setTimeout(load, 1500);
    return () => {
      clearTimeout(t);
      try { window.speechSynthesis.removeEventListener('voiceschanged', load); } catch { /* ignore */ }
    };
  }, []);

  /**
   * 微信 / QQ / 微博等 App 内置浏览器:X5、WKWebView 常常**没有中文语音引擎**,
   * 甚至 speechSynthesis 存在但 speak() 完全静默。与其等 3 秒看门狗,直接判定
   * 走服务端合成——这些环境同时也是最需要「服务器语音」的场景。
   */
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent || '';
    if (/MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient|baiduboxapp|UCBrowser/i.test(ua)) {
      setForceServer(true);
    }
  }, []);

  // 浏览器引擎静默失败 → 由 speakRange 调用服务端兜底(用 ref 打破定义顺序依赖)
  const serverStartRef = useRef<(fromKey?: number) => void>(() => {});
  /**
   * 交给服务端语音合成。已回落过一次到本机语音时直接判失败(见 fellBackRef),
   * 避免浏览器↔服务端反复来回切换。
   */
  const bailToServerVoice = useCallback((fromKey?: number) => {
    if (fellBackRef.current) {
      setTtsError(true);
      setState('idle');
      setSpeakingKey(null);
      return;
    }
    serverStartRef.current?.(fromKey);
  }, []);

  /** 标记浏览器 TTS 不可用并交给服务端合成;page 可调用它做「没声音?」手动切换 */
  const useServerVoice = useCallback((fromKey?: number) => {
    setBrowserBroken(true);
    setForceServer(true);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    stopTick();
    stoppedRef.current = false;
    setTimeout(() => serverStartRef.current?.(fromKey), 30);
  }, [stopTick]);

  /**
   * 「静默失败」看门狗:浏览器 TTS 在缺少中文语音时会**既不发声也不报错**,
   * 用户点了朗读却毫无反应。这里在 speak 之后起一个定时器,若超时仍没有任何
   * 引擎事件(onstart/onend/onerror),判定该引擎不可用,自动切到服务端合成。
   */
  const watchdogRef = useRef<any>(0);
  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = 0;
    }
  }, []);
  const armWatchdog = useCallback(
    (gen: number, fromKey?: number, ms = 3000) => {
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = 0;
        if (stoppedRef.current || genRef.current !== gen) return;
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        setBrowserBroken(true);
        stopTick();
        stoppedRef.current = false;
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        bailToServerVoice(fromKey);
      }, ms);
    },
    [clearWatchdog, stopTick, bailToServerVoice]
  );

  // 卸载 / 停用时清掉看门狗,避免它把已放弃的朗读又拉起来
  useEffect(() => () => clearWatchdog(), [clearWatchdog]);

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

      // 浏览器引擎彻底发不出声(无中文语音 / 引擎静默失败)→ 交服务端合成,保证"点了一定有声音"
      const bailToServer = (fromKey?: number) => {
        clearWatchdog();
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        setBrowserBroken(true);
        stoppedRef.current = false;
        stopTick();
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        bailToServerVoice(fromKey);
      };

      // ---- 标题播报(「约翰福音 第 3 章」) ----
      const lead = withLead ? (leadTextRef.current || '').trim() : '';
      if (lead) {
        setState('playing');
        const key0 = list[fromIndex].key;
        speakingKeyRef.current = key0;
        setSpeakingKey(key0);
        speakCharRef.current = null;
        const lu = new SpeechSynthesisUtterance(lead);
        lu.lang = lang;
        lu.rate = rateRef.current;
        lu.volume = 1;
        pickVoice(lu);
        lu.onstart = () => clearWatchdog();
        lu.onend = () => {
          clearWatchdog();
          if (!alive()) return;
          setTimeout(() => { if (alive()) speakRangeRef.current?.(fromIndex, false); }, 60);
        };
        lu.onerror = (e: any) => {
          clearWatchdog();
          if (!alive()) return;
          if (isFatalTtsError(e?.error)) { bailToServer(key0); return; }
          setTimeout(() => { if (alive()) speakRangeRef.current?.(fromIndex, false); }, 60);
        };
        window.speechSynthesis.speak(lu);
        armWatchdog(gen, key0);
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

      u.onstart = () => clearWatchdog();
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
        clearWatchdog();
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
      u.onerror = (e: any) => {
        clearWatchdog();
        stopTick();
        if (!alive()) return;
        // 语音缺失 / 引擎不可用 → 服务端兜底;被 cancel/中断属正常流程,不降级
        if (isFatalTtsError(e?.error)) { bailToServer(spans[0].key); return; }
        speakCharRef.current = null;
        speakingKeyRef.current = null;
        setState('idle');
        setSpeakingKey(null);
      };

      setState('playing');
      window.speechSynthesis.speak(u);
      startTick({ t0, perChar, baseChar, spans, total: totalChars, wordSync: ws });
      // 3 秒内引擎既没 onstart 也没 onend/onerror → 判定静默失败(点了完全没声音),走服务端
      armWatchdog(gen, spans[0].key);
    },
    [lang, supported, startTick, stopTick, stopRaf, syncSpeakingKey, pickVoice, armWatchdog, clearWatchdog]
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
    // 中断仍在飞行中的合成请求(否则停止后连接还占着,浪费流量且可能串音)
    abortRef.current?.abort();
    abortRef.current = null;
    const a = audioRef.current;
    if (a) {
      // 先摘掉回调再停:设 src='' 在部分浏览器会触发 error 事件,
      // 若仍带着 onerror 会把"新一段"误判为失败(看到 idle/报错)。
      try {
        a.onended = null;
        a.onerror = null;
        a.ontimeupdate = null;
        a.pause();
        a.src = '';
      } catch { /* ignore */ }
      try { a.remove(); } catch { /* ignore */ }
      audioRef.current = null;
      setMediaEl((cur) => (cur === a ? null : cur));
    }
  }, []);

  /**
   * 把朗读用的 <audio> 挂进 DOM(隐藏)。
   * **必须挂**:Media Session / 息屏守卫靠 window 上的 play/pause/timeupdate/ended 事件,
   * 而脱离文档树的 <audio> 事件不会冒泡到 window → 锁屏控件永远挂不上、朗读卡会误标「息屏暂停」。
   */
  const mountAudio = useCallback((el: HTMLAudioElement) => {
    try {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    } catch { /* ignore */ }
  }, []);

  // ---- 浏览器直连兜底 ----
  // 服务端合成全部失败时(云机房 IP 被风控 / 出境被丢包),改由**用户自己的浏览器**
  // 直接请求同一免密钥 TTS 接口:请求来自用户网络(家宽/4G),通常不受机房风控限制。
  // 长文本分段串行播放;若自动播放被浏览器拦截(异步失败已脱离用户手势),
  // 保留当前段并置 clientReady,由页面提示「点此播放」。
  const clientSegsRef = useRef<{ text: string; charStart: number }[]>([]);
  const clientIdxRef = useRef(0);
  const pendingAudioRef = useRef<HTMLAudioElement | null>(null);

  const clientStart = useCallback(
    (fromIndex: number) => {
      const list = itemsRef.current;
      if (!list.length) return;
      const { text, spans } = buildText(fromIndex);
      const rawSegs = splitBySentence(text, CLIENT_SEG_CHARS);
      if (!rawSegs.length) {
        setTtsLoading(false);
        setTtsError(true);
        setState('idle');
        setSpeakingKey(null);
        return;
      }
      // 计算每段在整段文本中的字符偏移(播放进度 → 节级高亮)
      let off = 0;
      clientSegsRef.current = rawSegs.map((s) => {
        const at = text.indexOf(s, off);
        const start = at >= 0 ? at : off;
        off = start + s.length;
        return { text: s, charStart: start };
      });
      clientIdxRef.current = 0;

      stoppedRef.current = false;
      genRef.current += 1;
      const gen = genRef.current;
      // 先停掉上一段正在播放的兜底音频,避免多段同时响(串音)
      serverStopInner();

      setTtsError(false);
      setTtsLoading(true);

      const fail = () => {
        setTtsLoading(false);
        setClientReady(false);
        pendingAudioRef.current = null;
        audioRef.current = null;
        setMediaEl(null);
        setState('idle');
        setSpeakingKey(null);
        speakCharRef.current = null;
        if (!stoppedRef.current && genRef.current === gen) {
          // 在线合成整条链路都不通时,回落到本机语音朗读(最多一次,见 fellBackRef):
          // 前台还能出声。此时出声的是 speechSynthesis,息屏后会被系统挂起。
          const fb = speakRangeRef.current;
          if (fb && !fellBackRef.current) {
            fellBackRef.current = true;
            setTtsError(false);
            setTimeout(() => {
              if (!stoppedRef.current && genRef.current === gen) fb(fromIndex, true);
            }, 0);
            return;
          }
          setTtsError(true);
        }
      };

      const step = () => {
        if (stoppedRef.current || genRef.current !== gen) return;
        const segs = clientSegsRef.current;
        const i = clientIdxRef.current;
        if (i >= segs.length) {
          setTtsLoading(false);
          setClientReady(false);
          pendingAudioRef.current = null;
          audioRef.current = null;
          setMediaEl(null);
          speakCharRef.current = null;
          speakingKeyRef.current = null;
          setState('idle');
          setSpeakingKey(null);
          onEndRef.current?.();
          return;
        }
        const seg = segs[i];
        const audio = new Audio(baiduTtsUrl(seg.text));
        audio.preload = 'auto';
        audio.playbackRate = rateRef.current;
        mountAudio(audio);
        audioRef.current = audio;
        setMediaEl(audio);
        pendingAudioRef.current = null;
        audio.ontimeupdate = () => {
          if (!audio.duration) return;
          const at =
            seg.charStart + Math.floor((audio.currentTime / audio.duration) * seg.text.length);
          syncSpeakingKey(at, spans);
        };
        audio.onended = () => {
          if (stoppedRef.current || genRef.current !== gen) return;
          clientIdxRef.current = i + 1;
          step();
        };
        audio.onerror = () => fail();
        // 预取下一段,缩短段间间隙
        if (i + 1 < segs.length) {
          try {
            const pre = new Audio(baiduTtsUrl(segs[i + 1].text));
            pre.preload = 'auto';
            pre.load();
          } catch { /* ignore */ }
        }
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (stoppedRef.current || genRef.current !== gen) return;
            setTtsLoading(false);
            setClientReady(false);
            pendingAudioRef.current = null;
            setTtsError(false);
            setTtsProvider('client');
            setState('playing');
          }).catch(() => {
            if (stoppedRef.current || genRef.current !== gen) return;
            // 自动播放被拦(无用户手势) → 保留该段,等用户点一下即可播放
            setTtsLoading(false);
            pendingAudioRef.current = audio;
            setClientReady(true);
          });
        }
      };
      step();
    },
    [buildText, syncSpeakingKey, serverStopInner, mountAudio]
  );

  /** 用户点击「点此播放」:播放已就绪但被自动播放策略拦下的兜底音频 */
  const clientPlay = useCallback(() => {
    const a = pendingAudioRef.current;
    if (!a) return;
    setClientReady(false);
    setTtsError(false);
    setState('playing');
    setTtsProvider('client');
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => setTtsError(true));
    }
  }, []);

  /**
   * 极短静音 WAV(约 4ms)。iOS / 微信内置浏览器要求 <audio> 的首次播放必须发生在
   * 用户手势的同步调用栈内,而服务端合成是异步的(fetch → blob → play),等到那时
   * 手势上下文已丢失,play() 会被静默拒绝。这里在点击栈内先播一次静音解锁,
   * 后续再播放真实音频就不会被拦。
   */
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const a = new Audio(SILENT_WAV);
      const p = a.play();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  const serverStart = useCallback(async (fromKey?: number) => {
    const list = itemsRef.current;
    if (!list.length) return;
    unlockAudio(); // 必须在第一个 await 之前,处于用户点击的同步栈内
    stoppedRef.current = false;
    genRef.current += 1;
    let i = 0;
    if (fromKey != null) {
      const f = list.findIndex((it) => it.key === fromKey);
      if (f >= 0) i = f;
    }
    const { text, spans } = buildText(i);
    setTtsError(false);
    setClientReady(false);
    setTtsLoading(true);
    setState('playing');
    const gen = genRef.current;

    // 先停掉上一段正在播放/合成中的音频,避免切节或点别的节时多段同时响(串音)
    serverStopInner();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => {
      try { ctrl.abort(); } catch { /* ignore */ }
    }, TTS_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch('/api/v1/bible/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('tts_failed');
      setTtsProvider(res.headers.get('x-tts-provider'));
      const blob = await res.blob();
      if (stoppedRef.current || genRef.current !== gen) return; // 已停止/换章
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rateRef.current;
      mountAudio(audio);
      audioRef.current = audio;
      setMediaEl(audio);
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
        if (!stoppedRef.current && genRef.current === gen) {
          // 整段读完:必须自己回到 idle,否则 UI 永远停在「暂停朗读」,
          // 之后再点只会 pause/resume 一个已销毁的 <audio>(表现为点了没声音、也停不下来)。
          setState('idle');
          setSpeakingKey(null);
          speakCharRef.current = null;
          onEndRef.current?.();
        }
      };
      await audio.play();
      setState('playing');
    } catch {
      serverStopInner();
      setState('idle');
      setSpeakingKey(null);
      speakCharRef.current = null;
      // 用户主动停止 / 换章引发的中断不算故障,不弹错误提示
      if (!stoppedRef.current && genRef.current === gen) {
        // 服务端不可用(机房 IP 被风控 / 出境被丢包) → 交给浏览器直连兜底。
        // 延后一拍,避免被下面 finally 的 setTtsLoading(false) 覆盖。
        const idx = i;
        setTimeout(() => {
          if (!stoppedRef.current && genRef.current === gen) clientStart(idx);
        }, 0);
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ctrl) abortRef.current = null;
      setTtsLoading(false);
    }
  }, [buildText, syncSpeakingKey, serverStopInner, clientStart, unlockAudio, mountAudio]);

  // 浏览器引擎静默失败时由 speakRange 调用(用 ref 打破定义顺序依赖)
  useEffect(() => {
    serverStartRef.current = (fromKey?: number) => { void serverStart(fromKey); };
  }, [serverStart]);

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
    setClientReady(false);
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
      if (ttsMode === 'server') { void serverStart(fromKey); return; }
      if (!itemsRef.current.length) return;
      stoppedRef.current = false;
      genRef.current += 1;
      speakingKeyRef.current = null;
      stopRaf();
      let i = 0;
      if (fromKey != null) {
        const found = itemsRef.current.findIndex((it) => it.key === fromKey);
        if (found >= 0) i = found;
      }
      // Chrome 的已知缺陷:speak() 紧跟在 cancel() 之后会把这次朗读一起吞掉(无声)。
      // 所以 cancel 后先 resume 复位引擎,再延后一拍才 speak。
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch { /* ignore */ }
      setTimeout(() => { if (!stoppedRef.current) speakRange(i, true); }, 80);
    },
    [speakRange, ttsMode, stopRaf, serverStart]
  );

  const pause = useCallback(() => {
    if (ttsMode === 'server') { serverPause(); return; }
    stopRaf();
    pauseAtRef.current = performance.now();
    window.speechSynthesis.pause();
    setState('paused');
  }, [ttsMode, stopRaf, serverPause]);

  const resume = useCallback(() => {
    if (ttsMode === 'server') { serverResume(); return; }
    window.speechSynthesis.resume();
    setState('playing');
    // 补偿暂停时长,让时间估算继续准确(若该浏览器依赖估算兜底)
    if (estRef.current) {
      estRef.current.t0 += performance.now() - pauseAtRef.current;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [ttsMode, tick, serverResume]);

  const stop = useCallback(() => {
    if (ttsMode === 'server') { serverStop(); return; }
    clearWatchdog();
    stopTick();
    stoppedRef.current = true;
    genRef.current += 1;
    speakCharRef.current = null;
    speakingKeyRef.current = null;
    window.speechSynthesis.cancel();
    setState('idle');
    setSpeakingKey(null);
  }, [ttsMode, stopTick, serverStop, clearWatchdog]);

  const setRate = useCallback(
    (r: number) => {
      if (ttsMode === 'server') { serverSetRate(r); return; }
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
          stoppedRef.current = false;
          // 从「当前正在读的节」而非批起点重启,避免改语速后回退重读前几节
          const curKey = speakingKeyRef.current;
          let fromIdx = posRef.current;
          if (curKey != null) {
            const i = itemsRef.current.findIndex((it) => it.key === curKey);
            if (i >= 0) fromIdx = i;
          }
          setTimeout(() => speakRange(fromIdx), 80);
        }
      }
    },
    [speakRange, state, stopTick, serverSetRate, ttsMode]
  );

  /** 切换章节 / 卸载时停止朗读 */
  useEffect(() => {
    return () => {
      clearWatchdog();
      stopRaf();
      stopTick();
      stoppedRef.current = true;
      genRef.current += 1;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      serverStopInner();
    };
  }, [stopRaf, stopTick, clearWatchdog, serverStopInner]);

  // 朗读内容变化(如换章)时自动停止
  useEffect(() => {
    if (silent) return; // 兜底实例不碰 speechSynthesis,避免误掐常驻朗读
    clearWatchdog();
    stoppedRef.current = true;
    genRef.current += 1;
    stopTick();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    // 停掉正在播放的音频(换章时服务器语音不会因 items 变化自动停,否则旧章音频成孤儿持续响)
    serverStopInner();
    speakingKeyRef.current = null;
    setState('idle');
    setSpeakingKey(null);
    setClientReady(false);
    speakCharRef.current = null;
  }, [items, stopTick, clearWatchdog, serverStopInner, silent]);

  /* ---------------- 后台播放:锁屏控件 + 悬浮朗读卡 ---------------- */

  // start/pause/... 每次重渲都是新引用;用 ref 取最新的,避免 Media Session 回调闭包过期
  const ctrlRef = useRef({ start, pause, resume, stop });
  useEffect(() => {
    ctrlRef.current = { start, pause, resume, stop };
  }, [start, pause, resume, stop]);

  const metaTitleRef = useRef<string>('');
  const metaSubRef = useRef<string>('');
  const mediaHrefRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    metaTitleRef.current = opts.mediaTitle || leadTextRef.current || '经文朗读';
    metaSubRef.current = opts.mediaSubtitle || '';
    mediaHrefRef.current = opts.mediaHref;
  }, [opts.mediaTitle, opts.mediaSubtitle, opts.mediaHref]);

  useMediaBackplay({
    // 用 audioRef(创建元素时同步赋值),**不要**用 state 版 mediaElRef:
    // audio.play() 触发的 play 事件会早于「mediaEl state → effect」生效,
    // 用 mediaElRef 时 belongToUs 判定失败 → 锁屏控件永远挂不上
    // (朗读卡也会跟着误标「息屏暂停」)。
    getEl: () => audioRef.current ?? mediaElRef.current,
    meta: () => ({
      title: metaTitleRef.current || '经文朗读',
      artist: metaSubRef.current || '圣约社区 · 朗读',
      album: '圣约社区',
    }),
    handlers: () => ({
      play: () => ctrlRef.current.resume(),
      pause: () => ctrlRef.current.pause(),
      stop: () => ctrlRef.current.stop(),
    }),
    enabled: bg.enabled,
  });

  // 把朗读会话广播给全站悬浮卡:切到别的页面也能暂停/停止
  const sessionIdRef = useRef<string>('');
  useEffect(() => {
    if (silent) return; // 兜底实例不广播,避免覆盖常驻会话
    if (state === 'idle' && !ttsLoading) {
      setSpeechSession(null);
      return;
    }
    if (!sessionIdRef.current) {
      sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const id = sessionIdRef.current;
    setSpeechSession({
      id,
      title: metaTitleRef.current || '经文朗读',
      subtitle: metaSubRef.current || undefined,
      state: ttsLoading ? 'loading' : state === 'playing' ? 'playing' : 'paused',
      // 只有走 <audio> 的朗读能在息屏后继续;speechSynthesis 会被系统挂起。
      // 判据用 audioRef(同步赋值)而非 mediaElRef(state 版,晚一拍),否则会误标「息屏暂停」。
      backplayable: ttsMode === 'server' && !!audioRef.current,
      toggle: () => {
        const c = ctrlRef.current;
        if (ttsLoading) return;
        // idle 时(如息屏被系统中断)重新开始,而不是无反应
        if (state === 'idle') c.start();
        else if (state === 'playing') c.pause();
        else c.resume();
      },
      stop: () => ctrlRef.current.stop(),
      href: mediaHrefRef.current,
    });
    return () => {
      if (getSpeechSession()?.id === id) setSpeechSession(null);
    };
  }, [state, ttsLoading, ttsMode, mediaEl, silent]);

  // 停下时清掉会话标记,下次从头开始朗读会生成新 id
  useEffect(() => {
    if (state === 'idle' && !ttsLoading) sessionIdRef.current = '';
  }, [state, ttsLoading]);

  // 朗读与背景音乐互斥:开读前先让音乐安静(两者一起响没法听)
  useEffect(() => {
    if (state !== 'playing' || ttsLoading) return;
    maybePlayer?.pauseIfPlaying?.();
  }, [state, ttsLoading, maybePlayer]);

  return {
    supported,
    /** 朗读引擎模式:browser=浏览器原生 TTS;server=后端合成音频 */
    ttsMode,
    /** 浏览器原生 TTS 被判定不可用(缺中文语音 / 引擎静默失败) */
    browserBroken,
    /** 当前选中的语音名(浏览器模式) */
    voiceName,
    /** 手动切换到服务端语音(「点了没声音」时用户可自行切换) */
    useServerVoice,
    /** 服务端合成中(首屏等待) */
    ttsLoading,
    /** 服务端合成失败(如所有 TTS 源都不可达),前端据此提示 */
    ttsError,
    /** 实际合成来源(edge/baidu/cache/client),由响应头回传 */
    ttsProvider,
    /** 浏览器直连兜底已就绪但被自动播放策略拦下,等待用户点击播放 */
    clientReady,
    /** 触发浏览器直连播放(走用户自身网络合成) */
    clientPlay,
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
