/**
 * 朗读(useSpeech)的对外契约:数据结构 + 合成/兜底用到的常量。
 *
 * 从 useSpeech.ts(1285 行)拆出:这些是与 hook 实现无关的公共部分,
 * 页面/组件只需要类型时不必再把整个 hook 拖进依赖图,也让调优常量有地方统一存放。
 */
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

export const CHUNK_VERSES = 4;

/**
 * 逐节合成时的单节请求超时。按节请求文本很短,正常 <1s;
 * 给到 20s 既能容忍机房出境抖动,又不会让用户对着「合成中」干等太久。
 */
export const TTS_CHUNK_TIMEOUT_MS = 20000;

/** 边读边取:当前节播放时向后预取几节(多了浪费流量,少了会有段间空档) */
export const TTS_PREFETCH_AHEAD = 3;

/** 浏览器直连兜底的分段字数:URL 会把中文 3 倍编码,取小值避免超长 URL */
export const CLIENT_SEG_CHARS = 200;

/**
 * 这些错误码说明「这台设备的语音引擎根本发不出声」,
 * 必须切到服务端合成;interrupted/canceled 是我们主动取消,属正常流程。
 */
export const FATAL_TTS_ERRORS = new Set([
  'synthesis-failed',
  'synthesis-unavailable',
  'language-unavailable',
  'voice-unavailable',
  'audio-busy',
  'audio-hardware',
]);
export function isFatalTtsError(code?: string) {
  return !!code && FATAL_TTS_ERRORS.has(code);
}
