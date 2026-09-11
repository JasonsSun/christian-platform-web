export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh';
export const LOCALE_COOKIE = 'platform_locale';

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
