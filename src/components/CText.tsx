'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';

/**
 * 按当前简繁 variant 转换用户生成内容（诗歌歌词、活动描述、见证/代祷正文等）。
 * 仅对字符串子节点生效；非字符串（如 JSX、组件）原样透传。
 * variant==='s' 时零开销透传。
 */
export default function CText({ children }: { children: ReactNode }) {
  const { variant, convert } = useI18n();
  if (typeof children !== 'string') return <>{children}</>;
  return <>{variant === 't' ? convert(children) : children}</>;
}
