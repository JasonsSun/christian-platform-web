'use client';

import { useEffect, useState } from 'react';

/**
 * 网络状态条：断网时提示，恢复后自动消失。
 * 目的：避免用户在断网时反复点击却只看到"请求失败"，不知道是网络问题。
 */
export default function NetworkBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center text-sm py-2 px-4">
      当前网络不可用，操作将在恢复网络后重试
    </div>
  );
}
