import type { ConverterFunction } from 'opencc-js';
import type { Variant } from './config';

/**
 * 简繁转换：基于 opencc-js 的 OpenCC 词典（cn<->tw）。
 *
 * 性能要点：opencc-js 含完整词典，安装体积约 6MB。原先是静态 import，被
 * I18nProvider（客户端组件）依赖 —— 词典会被打进客户端主包，而绝大多数用户
 * 使用简体，一生也用不到这份数据。
 *
 * 现在改为按需载入，并保持 `convert()` 同步签名：
 * - 词典未就绪时返回原文（不阻塞渲染，也不在 SSR/CSR 间产生不一致）；
 * - 载入完成后通过订阅回调通知上层重渲染；
 * - 载入结果模块级缓存，一次会话只需一次；失败则置位，避免反复重试。
 */

/** 已就绪的转换器；尚未载入时为 null */
let s2tConv: ConverterFunction | null = null;
let t2sConv: ConverterFunction | null = null;

/** 正在载入的 promise，避免并发重复触发 */
let loading: Promise<void> | null = null;

/** 载入失败时置 true，防止每次渲染都重试 */
let loadFailed = false;

/** 就绪回调集合 */
const readyCbs = new Set<() => void>();

/** 订阅词典就绪事件，返回取消订阅函数 */
export function onVariantReady(cb: () => void): () => void {
  readyCbs.add(cb);
  return () => readyCbs.delete(cb);
}

/** 词典是否已可用 */
export function variantReady(): boolean {
  return s2tConv !== null;
}

/**
 * 异步载入词典。重复调用安全（幂等）。
 * 载入成功会通知所有订阅者重渲染。
 */
export async function loadVariantDict(): Promise<void> {
  if (s2tConv || loadFailed) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      // 动态 import：webpack 会把该包拆成独立 chunk，不在主包里
      const { Converter } = await import('opencc-js');
      s2tConv = Converter({ from: 'cn', to: 'tw' });
      t2sConv = Converter({ from: 'tw', to: 'cn' });
      readyCbs.forEach((cb) => {
        try {
          cb();
        } catch {
          /* 单个订阅者出错不影响其它订阅者 */
        }
      });
    } catch (e) {
      loadFailed = true;
      console.warn('[i18n] 简繁词典载入失败，页面将继续显示原文', e);
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/**
 * 将文本在简体(s)/繁体(t)之间转换（同步）。
 * - to='t'：简体 -> 繁体（台湾用字）
 * - to='s'：繁体 -> 简体
 *
 * 词典尚未载入时返回原文（优雅降级），不会抛错。
 * 非字符串或空串原样返回。
 */
export function convert(text: string, to: Variant): string {
  if (!text || typeof text !== 'string') return text;
  const conv = to === 't' ? s2tConv : t2sConv;
  if (!conv) return text;
  try {
    return conv(text);
  } catch {
    return text;
  }
}
