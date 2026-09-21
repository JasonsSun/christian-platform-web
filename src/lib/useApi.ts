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
  const firstRun = useRef(true);
  /**
   * 请求序号。deps 里带搜索关键词时（全站十几个列表页都是这样），挂载后的 reload
   * 一律走 noCache，每个关键词都是真实往返，慢网络上「后发的先回」：
   * 先发的旧响应会把新结果盖回去（列表停在打了一半的关键词上），
   * 它的 error 会把成功当失败，finally 里的 setLoading(false) 还会在
   * 新请求仍在途时把压暗态提前撤掉。只允许最新一次请求落地。
   */
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      // 首次挂载允许复用内存缓存(页面来回切换时秒开),之后一律走真实请求拿最新数据
      const res = await api<T>(path, {}, { noCache: !firstRun.current });
      if (id !== seq.current) return;
      setData(res);
    } catch (e: any) {
      if (id !== seq.current) return;
      setError(e?.message || '加载失败');
    } finally {
      if (id === seq.current) setLoading(false);
      firstRun.current = false;
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
