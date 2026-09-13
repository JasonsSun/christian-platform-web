'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * 带「服务端预取初始值」的数据请求。
 * 传入 initial 时:首屏直接用它渲染(HTML 直出,无白屏),并跳过首次自动请求,
 * 后续 deps 变化或手动 reload 才真正发请求,减少慢网络下的无效往返。
 */
export function useApi<T = any>(path: string | null, deps: any[] = [], initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(!!path && initial == null);
  const [error, setError] = useState<string | null>(null);
  const skipNext = useRef(initial != null);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<T>(path);
      setData(res);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** 触发型请求(按钮点击等) */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e: any) {
      setError(e?.message || '操作失败');
      return null;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error, setError };
}
