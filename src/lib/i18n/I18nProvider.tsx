'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  DEFAULT_VARIANT,
  LOCALES,
  LOCALE_COOKIE,
  VARIANT_COOKIE,
  isLocale,
  isVariant,
  type Locale,
  type Variant,
} from './config';
import { getDictionary } from './dict';
import { convert } from './variant';

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  variant: Variant;
  setVariant: (v: Variant) => void;
  /** 将简体文本按当前 variant 转换（variant==='t' 转繁体，否则原样） */
  convert: (text: string) => string;
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

/** 根据 locale + variant 计算 <html lang> */
function resolveLang(locale: Locale, variant: Variant): string {
  if (locale === 'zh') return variant === 't' ? 'zh-Hant' : 'zh-CN';
  return locale;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
  initialVariant = DEFAULT_VARIANT,
}: {
  children: ReactNode;
  initialLocale?: Locale;
  initialVariant?: Variant;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [variant, setVariantState] = useState<Variant>(initialVariant);

  // 客户端挂载后，按 localStorage 同步用户偏好（初始值与 SSR 一致，避免 hydration 不匹配）
  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem('platform_locale');
      if (savedLocale && isLocale(savedLocale) && savedLocale !== locale) {
        setLocaleState(savedLocale);
      }
      const savedVariant = localStorage.getItem('platform_variant');
      if (savedVariant && isVariant(savedVariant) && savedVariant !== variant) {
        setVariantState(savedVariant);
      }
    } catch {
      /* ignore */
    }
  }, [locale, variant]);

  // 同步 <html lang>
  useEffect(() => {
    document.documentElement.lang = resolveLang(locale, variant);
  }, [locale, variant]);

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

  const setVariant = useCallback((v: Variant) => {
    setVariantState(v);
    try {
      localStorage.setItem('platform_variant', v);
    } catch {
      /* ignore */
    }
    try {
      document.cookie = `${VARIANT_COOKIE}=${v};path=/;max-age=31536000;samesite=lax`;
    } catch {
      /* ignore */
    }
  }, []);

  const convertForVariant = useCallback(
    (text: string) => (variant === 't' ? convert(text, 't') : text),
    [variant]
  );

  const t = useCallback(
    (key: string, vars?: Vars) => {
      let str = lookup(getDictionary(locale), key) ?? lookup(getDictionary(DEFAULT_LOCALE), key) ?? key;
      if (variant === 't') str = convert(str, 't');
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [locale, variant]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, variant, setVariant, convert: convertForVariant, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
