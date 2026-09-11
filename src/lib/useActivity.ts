'use client';

import { useEffect } from 'react';
import { API_BASE, tokenStore } from './api';
import { useAuth } from './auth';

/**
 * 活跃上报:在线时长(秒)+ 使用次数(点击/按键),写入 user_activity_daily,
 * 再由 server/quota.ts 汇总成信任分与成长等级,决定上传的文件大小与视频时长上限。
 */
export function useActivityTracker(intervalMs = 30_000) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let seconds = 0;
    let actions = 0;
    let visits = 1;

    const post = (keepalive: boolean) => {
      const token = tokenStore.get();
      if (!token) return;
      const payload = { seconds: Math.floor(seconds), actions, visits };
      seconds = 0; actions = 0; visits = 0;
      if (payload.seconds <= 0 && payload.actions <= 0 && payload.visits <= 0) return;
      fetch(`${API_BASE}/me/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        keepalive,
      }).catch(() => { /* 忽略上报失败 */ });
    };

    const bump = () => { actions += 1; };
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') seconds += intervalMs / 1000;
      if (seconds >= 60) post(false);
    }, intervalMs);

    const onHide = () => post(true);
    window.addEventListener('pointerdown', bump, { passive: true });
    window.addEventListener('keydown', bump, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      post(true);
    };
  }, [user?.id, intervalMs]);
}
