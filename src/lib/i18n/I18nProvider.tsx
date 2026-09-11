'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, type Locale } from './config';
import { getDictionary } from './dict';

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Vars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // 客户端挂载后，按 localStorage 同步用户偏好（初始值与 SSR 一致，避免 hydration 不匹配）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('platform_locale');
      if (saved && (LOCALES as readonly string[]).includes(saved) && saved !== locale) {
        setLocaleState(saved as Locale);
      }
    } catch {
      /* ignore */
    }
  }, [locale]);

  // 同步 <html lang>
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('platform_locale', l);
    } catch {
      /* ignore */
    }
    try {
      document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=31536000;samesite=lax`;
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      let str = lookup(getDictionary(locale), key) ?? lookup(getDictionary(DEFAULT_LOCALE), key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [locale]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
