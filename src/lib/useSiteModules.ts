'use client';

import { useEffect, useState } from 'react';
import { moduleOfPath } from './siteModules';

/**
 * 已下线的模块列表。
 *
 * 服务端 layout 会把初始状态以 props 传下来（非缓存路由无闪烁）；
 * 但首页等 ISR 页面可能在构建期就把 HTML 烤好了，服务端那份是旧快照，
 * 所以这里水合后再拉一次公开配置校正 —— 保证刚下线的入口不会挂着。
 */
export function useDisabledModules(initial: string[] = []): string[] {
  const [list, setList] = useState<string[]>(initial);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && Array.isArray(j?.disabledModules)) setList(j.disabledModules as string[]);
      })
      .catch(() => { /* 取不到就沿用服务端初始值 */ });
    return () => { alive = false; };
  }, []);

  return list;
}

/** 该路径所属模块是否已下线（不属于任何模块的路径恒为可见） */
export function useModuleFilter(initial: string[] = []) {
  const off = useDisabledModules(initial);
  return {
    disabled: off,
    isOff: (href: string) => {
      const m = moduleOfPath(href);
      return !!m && off.includes(m);
    },
  };
}
