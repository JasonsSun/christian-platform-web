'use client';

/**
 * 全局非模态提示（Notice）
 *
 * 设计约束：本系统「不使用任何弹框」。所有原本依赖 window.alert 的提示，
 * 一律改为页面顶部内联横幅 —— 不遮罩、不阻塞、不夺取焦点，用户可继续操作。
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type NoticeTone = 'info' | 'success' | 'error' | 'warn';

interface NoticeItem {
  id: number;
  tone: NoticeTone;
  message: string;
  href?: string;
  hrefLabel?: string;
}

interface NoticeApi {
  notify: (message: string, tone?: NoticeTone, opts?: { href?: string; hrefLabel?: string; duration?: number }) => void;
  info: (message: string, opts?: { href?: string; hrefLabel?: string }) => void;
  success: (message: string, opts?: { href?: string; hrefLabel?: string }) => void;
  error: (message: string, opts?: { href?: string; hrefLabel?: string }) => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);

const TONE_STYLE: Record<NoticeTone, string> = {
  info: 'bg-primary-600 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
  warn: 'bg-gold-600 text-white',
};

const TONE_ICON: Record<NoticeTone, string> = {
  info: 'M12 16v-4m0-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
  success: 'M5 13l4 4L19 7',
  error: 'M12 8v4m0 4h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
  warn: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
};

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback<NoticeApi['notify']>(
    (message, tone = 'info', opts) => {
      if (!message) return;
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-2), { id, tone, message, href: opts?.href, hrefLabel: opts?.hrefLabel }]);
      const life = opts?.duration ?? (tone === 'error' ? 5000 : 3200);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), life)
      );
    },
    [dismiss]
  );

  const api = useMemo<NoticeApi>(
    () => ({
      notify,
      info: (m, o) => notify(m, 'info', o),
      success: (m, o) => notify(m, 'success', o),
      error: (m, o) => notify(m, 'error', o),
    }),
    [notify]
  );

  return (
    <NoticeContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div
          // 非模态容器：不铺满视口、不拦截指针事件以外的交互
          className="pointer-events-none fixed left-0 right-0 top-16 md:top-20 z-[200] flex flex-col items-center gap-2 px-4"
          aria-live="polite"
          data-guard="notice"
        >
          {items.map((n) => (
            <div
              key={n.id}
              className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 shadow-card-hover flex items-start gap-3 ${TONE_STYLE[n.tone]}`}
              style={{ animation: 'notice-in .22s ease-out' }}
            >
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TONE_ICON[n.tone]} />
              </svg>
              <div className="flex-1 text-sm leading-relaxed">
                <span className="whitespace-pre-wrap">{n.message}</span>
                {n.href && (
                  <a href={n.href} className="ml-2 underline font-medium">
                    {n.hrefLabel || '查看'}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                className="text-white/80 hover:text-white flex-shrink-0"
                aria-label="关闭提示"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </NoticeContext.Provider>
  );
}

/** 安全获取：未挂载 Provider 时退化为 no-op，绝不抛出 */
export function useNotice(): NoticeApi {
  const ctx = useContext(NoticeContext);
  return (
    ctx || {
      notify: () => {},
      info: () => {},
      success: () => {},
      error: () => {},
    }
  );
}
