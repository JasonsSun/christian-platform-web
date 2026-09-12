'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'sepia';

const THEME_KEY = 'theme';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** 在 light -> dark -> sepia 之间循环切换 */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const ORDER: Theme[] = ['light', 'dark', 'sepia'];

function readInitial(): Theme {
  if (typeof document === 'undefined') return 'light';
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'dark' || v === 'sepia' ? v : 'light';
}

/**
 * 全局主题 Provider。
 * 真实生效在 <html data-theme> 上，由 layout 注入的无闪烁内联脚本在首屏前设置，
 * 这里只负责同步 React 状态 + 持久化 + 提供切换入口。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  const apply = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      apply(t);
      // 跨标签页同步
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* ignore */
      }
    },
    [apply]
  );

  const cycle = useCallback(() => {
    setThemeState((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      apply(next);
      return next;
    });
  }, [apply]);

  // 订阅其他标签页的主题变更
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && e.newValue) apply(e.newValue as Theme);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // 未包裹时给安全默认，避免崩溃
    return { theme: 'light', setTheme: () => {}, cycle: () => {} };
  }
  return ctx;
}

/** 首屏前无闪烁地设置 data-theme（layout 中以内联脚本注入） */
export const themeNoFlashScript = `try{var t=localStorage.getItem('${THEME_KEY}')||'light';if(t==='dark'||t==='sepia'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme','light');}}catch(e){document.documentElement.setAttribute('data-theme','light');}`;
