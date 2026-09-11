'use client';

/**
 * 统一导航辅助：需要登录的操作一律「跳转登录页」，不使用弹框提示。
 */

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/** 返回 goLogin()，会把当前页面作为 next 参数带到登录页 */
export function useGoLogin() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (nextPath?: string) => {
      const target = nextPath || pathname || '/';
      router.push(`/login?next=${encodeURIComponent(target)}`);
    },
    [router, pathname]
  );
}

/** 登录页使用：安全解析回跳地址，仅允许站内相对路径 */
export function safeNext(next: string | null | undefined, fallback = '/me'): string {
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  return next;
}
