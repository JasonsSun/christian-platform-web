export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh';
export const LOCALE_COOKIE = 'platform_locale';

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

// 简繁字形变体：'s' 简体 / 't' 繁体（台湾用字）。独立于语言（zh 下生效）。
export const VARIANTS = ['s', 't'] as const;
export type Variant = (typeof VARIANTS)[number];

export const DEFAULT_VARIANT: Variant = 's';
export const VARIANT_COOKIE = 'platform_variant';

export function isVariant(v: string | undefined | null): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}
