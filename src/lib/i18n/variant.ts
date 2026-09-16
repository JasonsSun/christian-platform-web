import { Converter, type ConverterFunction } from 'opencc-js';
import type { Variant } from './config';

// 简繁转换：基于 opencc-js 的 OpenCC 词典（cn<->tw）。
// 转换器构建较重（加载词典），故模块级缓存，首次使用时惰性构建。
let s2tConv: ConverterFunction | null = null;
let t2sConv: ConverterFunction | null = null;

/**
 * 将文本在简体(s)/繁体(t)之间转换。
 * - to='t'：简体 -> 繁体（台湾用字）
 * - to='s'：繁体 -> 简体
 * 非字符串或空串原样返回。
 */
export function convert(text: string, to: Variant): string {
  if (!text || typeof text !== 'string') return text;
  if (to === 't') {
    if (!s2tConv) s2tConv = Converter({ from: 'cn', to: 'tw' });
    return s2tConv(text);
  }
  if (!t2sConv) t2sConv = Converter({ from: 'tw', to: 'cn' });
  return t2sConv(text);
}
