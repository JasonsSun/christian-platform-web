'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

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
