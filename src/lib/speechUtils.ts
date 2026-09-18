/**
 * 朗读(useSpeech)的纯函数层:与服务端 TTS 兜底、浏览器直连兜底共用的文本 / 字符区间计算。
 *
 * 这些函数无 React 依赖、无闭包状态,输入相同则输出相同,便于单测,也把「引擎适配」里
 * 最易出错的文本拼装逻辑从巨型 hook(useSpeech.ts,1200+ 行)中剥离出来单独维护。
 * hook 侧只保留状态机与音频播放,调用处把 ref.current 透传进来即可。
 */
import type { SpeechItem, SpeechSegment } from './speechContract';

/** 由 items 预计算每节全局字符区间(逐字高亮 / 进度定位用) */
export function computeGlobalRanges(items: SpeechItem[]): Record<number, SpeechSegment> {
  const seg: Record<number, SpeechSegment> = {};
  let raw = 0;
  for (const it of items) {
    const t = Array.from((it.text || '').trim());
    seg[it.key] = { start: raw, end: raw + t.length };
    raw += t.length;
  }
  return seg;
}

export interface BuildTextOpts {
  lead: string;
  /** 是否播报节号(如「第 3 节」)。为 false 时直接读正文 */
  announceKey: boolean;
  /** 节号格式化,announceKey 为 true 时用来拼「第 N 节，」前缀 */
  formatKey: (k: number) => string;
}

/** 拼出待合成文本,并返回每节在文本中的字符区间(进度高亮用) */
export function buildText(
  items: SpeechItem[],
  fromIndex: number,
  opts: BuildTextOpts
): { text: string; spans: { key: number; start: number; end: number }[] } {
  const list = items;
  const spans: { key: number; start: number; end: number }[] = [];
  let buf = '';
  const lead = (opts.lead || '').trim();
  if (lead) buf += lead + '。';
  const start = Math.max(0, Math.min(fromIndex, list.length - 1));
  for (let k = start; k < list.length; k++) {
    const it = list[k];
    if (buf && !buf.endsWith('。')) buf += '。';
    let head = '';
    if (opts.announceKey) head = opts.formatKey(it.key) + '，';
    const text = (it.text || '').trim();
    if (!Array.from(text).length) continue;
    const s = Array.from(buf).length;
    buf += head + text;
    const e = Array.from(buf).length;
    spans.push({ key: it.key, start: s, end: e });
  }
  return { text: buf, spans };
}

/** 逐节切分朗读文本(切分规则与 buildText 完全一致,保证字符区间 / 高亮对齐) */
export function buildChunks(
  items: SpeechItem[],
  fromIndex: number,
  opts: BuildTextOpts
): { idx: number; key: number; text: string; start: number; end: number }[] {
  const list = items;
  const chunks: { idx: number; key: number; text: string; start: number; end: number }[] = [];
  // 结尾补句号,给合成引擎一个自然收束;高亮区间仍按纯文本算,不受影响
  const stop = (s: string) => (/[。！？；：…」』）]$/.test(s) ? s : s + '。');
  let buf = '';
  let leadPrefix = '';
  const lead = (opts.lead || '').trim();
  if (lead) {
    buf += lead + '。';
    leadPrefix = lead + '。';
  }
  const start = Math.max(0, Math.min(fromIndex, list.length - 1));
  for (let k = start; k < list.length; k++) {
    const it = list[k];
    if (buf && !buf.endsWith('。')) buf += '。';
    const head = opts.announceKey ? opts.formatKey(it.key) + '，' : '';
    const text = (it.text || '').trim();
    if (!Array.from(text).length) continue;
    const s = Array.from(buf).length;
    buf += head + text;
    const e = Array.from(buf).length;
    // 标题只在「从本章第 1 节开始读」时播报:中途点某节跳读再念一遍章节名会很吵
    const withLead = chunks.length === 0 && k === 0 ? leadPrefix : '';
    chunks.push({ idx: k, key: it.key, text: stop(withLead + head + text), start: s, end: e });
  }
  return chunks;
}
