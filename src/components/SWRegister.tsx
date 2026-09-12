'use client';

import { useEffect } from 'react';

/** 在生产的 HTTPS 环境下注册 Service Worker，启用 PWA 离线缓存（弱网可读常读章节） */
export default function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 注册失败不影响主流程 */
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
