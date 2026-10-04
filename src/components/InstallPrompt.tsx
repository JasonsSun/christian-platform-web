'use client';

/**
 * PWA 安装引导：把站点装到手机桌面，以类原生 App 打开。
 *
 * - Android / 桌面 Chrome：监听 beforeinstallprompt，捕获后弹自定义提示条，点击触发原生安装。
 * - iOS Safari：不派发 beforeinstallprompt，改为展示「分享 → 添加到主屏幕」的图文引导。
 * - 已是独立窗口（已安装）或用户已关闭过 → 不再提示。
 *
 * 只在移动端（md:hidden）与底部标签栏之上出现，避免与 MobileNav / QuickPrefsDock 打架。
 */
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'platform:install-dismissed';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 专有
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* 隐私模式读不到，按未关闭处理 */
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      setIos(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div className="md:hidden fixed left-3 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[55] animate-slide-up">
      <div className="relative rounded-2xl border border-white/12 bg-primary-950/95 px-3.5 py-3 shadow-[0_16px_40px_-12px_rgba(8,10,30,0.7)] backdrop-blur">
        <button
          type="button"
          onClick={dismiss}
          aria-label="暂不安装"
          className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-3 pr-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9H3" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">把圣约社区装到桌面</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">
              {ios ? '点底部「分享」→「添加到主屏幕」，像 App 一样打开' : '一键安装，离线也能读经'}
            </p>
          </div>
        </div>
        {!ios && (
          <button
            type="button"
            onClick={install}
            className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
          >
            立即安装
          </button>
        )}
      </div>
    </div>
  );
}
