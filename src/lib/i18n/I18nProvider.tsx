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
import { loadVariantDict, onVariantReady } from './variant';
import { startTraditionalDomText } from './domVariant';

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  variant: Variant;
  setVariant: (v: Variant) => void;
  /** 兼容旧调用：渲染阶段不做转换，繁体由 domVariant 在挂载后统一补转 */
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

  /**
   * 渲染阶段一律不转换。
   *
   * 词典是按需载入的：服务端首屏「没词典」、客户端某个 Suspense 边界 hydration 时「已经有
   * 词典」，两边渲染出的文字不一样，React 会报 hydration 不匹配（#425）并把整棵子树丢掉
   * 重渲染。繁体的显示统一交给 domVariant 在挂载后补转，这里只保留接口形状。
   */
  const convertForVariant = useCallback((text: string) => text, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const str =
        lookup(getDictionary(locale), key) ?? lookup(getDictionary(DEFAULT_LOCALE), key) ?? key;
      if (!vars) return str;
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        str
      );
    },
    [locale]
  );

  // 只有切到繁体才载入简繁词典（6MB，按需加载），载入完成后重挂一次补转
  const [dictTick, setDictTick] = useState(0);
  useEffect(() => {
    if (variant !== 't') return;
    const unsub = onVariantReady(() => setDictTick((n) => n + 1));
    void loadVariantDict();
    return unsub;
  }, [variant]);

  // 词典就绪后重挂一次：首挂时 convert() 还是原样返回，正文里没走 t() 的中文要再扫一遍
  useEffect(() => {
    if (variant !== 't') return;
    return startTraditionalDomText();
  }, [variant, dictTick]);

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
