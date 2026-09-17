'use client';

/**
 * 顶部阅读进度条：随页面滚动显示当前阅读进度，带渐变辉光。
 * 使用 requestAnimationFrame 节流，避免滚动时频繁重排。
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const p = scrollable > 0 ? (doc.scrollTop || window.scrollY) / scrollable : 0;
      setProgress(Math.min(1, Math.max(0, p)));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pathname]);

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[60] pointer-events-none" aria-hidden>
      <div
        className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-gold-400 transition-[width] duration-100 ease-out"
        style={{ width: `${progress * 100}%`, boxShadow: '0 0 10px rgba(99,134,255,0.6)' }}
      />
    </div>
  );
}
