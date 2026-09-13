import type { ReactNode } from 'react';

/**
 * community 下的页面以公开内容为主,启用 ISR:HTML 结果缓存 60s。
 * 弱网/跨境访问时不必每次实时渲染;页面本身是客户端组件,
 * SSR 输出的是骨架,缓存不会串用户数据。
 */
export const revalidate = 60;

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
