'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把子树挂到 document.body 的传送门。
 *
 * 为什么必须用它：站内浮层用 `fixed inset-0` 定位，但只要任一祖先元素带有
 * transform / filter / backdrop-filter（本项目的 `.glass` 就带 backdrop-filter）
 * 或 overflow-hidden，fixed 就会以该祖先为参照系（错位/跑偏）或直接被裁剪（内容不见）。
 * 经 Portal 后浮层直接挂在 body 下，彻底摆脱祖先影响。
 *
 * 用法：`<Portal>{open && <div className="fixed inset-0 ..." data-guard="xxx">…</div>}</Portal>`
 * 注意：本站浮层必须带 `data-guard`，否则会被全局守卫生成器误判为外部广告弹窗移除。
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
