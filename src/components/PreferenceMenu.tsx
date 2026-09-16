'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LOCALES, type Variant } from '@/lib/i18n/config';
import { useA11y, type FontScale, type Contrast } from '@/lib/a11y';
import { useTheme, type Theme } from '@/lib/theme';

/**
 * 顶栏「显示与偏好」聚合入口。
 *
 * 原先语言 / 简繁 / 无障碍 / 主题是四个独立控件，合计约 220px，
 * 加上 11 个导航链接后整条顶栏超出 max-w-7xl 的可用宽度（1216px），
 * flex 会把每个文字链接压到 min-content —— 中文就变成一字一行竖排。
 * 这里把四者收进一个弹层，顶栏只占一个 36px 图标位。
 *
 * `inline` 供移动端汉堡菜单直接内嵌使用（不做绝对定位，避免嵌套浮层）。
 */

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 whitespace-nowrap px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
      <span className="text-xs text-ink-500 whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`w-full py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
        on ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-ink-200 text-ink-600 hover:bg-ink-100'
      }`}
    >
      {label}
    </button>
  );
}

export default function PreferenceMenu({
  tone = 'dark',
  inline = false,
}: {
  tone?: 'dark' | 'light';
  inline?: boolean;
}) {
  const { locale, setLocale, variant, setVariant, t } = useI18n();
  const { fontScale, contrast, reduceMotion, setFontScale, setContrast, setReduceMotion } = useA11y();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const langOptions = LOCALES.map((l) => ({ value: l, label: t('lang.' + l) }));
  const variantOptions = (['s', 't'] as Variant[]).map((v) => ({
    value: v,
    label: t(v === 's' ? 'pref.simplified' : 'pref.traditional'),
  }));
  const themeOptions = (['light', 'sepia', 'dark'] as Theme[]).map((v) => ({
    value: v,
    label: t('pref.' + v),
  }));
  const fontOptions = (['normal', 'lg', 'xl'] as FontScale[]).map((v) => ({
    value: v,
    label: t('pref.' + v),
  }));

  useEffect(() => {
    if (inline) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [inline]);

  const base =
    tone === 'light'
      ? 'text-white/85 hover:text-white hover:bg-white/10'
      : 'text-ink-600 hover:text-primary-600 hover:bg-primary-50';

  const panel = (
    <div
      className={`${
        inline ? 'mt-2 w-full' : 'absolute right-0 mt-2 w-72'
      } bg-white rounded-2xl shadow-card border border-ink-100 p-4 space-y-3 z-50 text-ink-800`}
      role="dialog"
      aria-label={t('pref.settings')}
      data-guard="preference-menu"
    >
      <Row label={t('pref.language')}>
        <Seg value={locale} options={langOptions} onChange={setLocale} />
      </Row>

      {locale === 'zh' && (
        <Row label={t('pref.variant')}>
          <Seg value={variant} options={variantOptions} onChange={setVariant} />
        </Row>
      )}

      <Row label={t('pref.theme')}>
        <Seg value={theme} options={themeOptions} onChange={setTheme} />
      </Row>

      <Row label={t('pref.fontSize')}>
        <Seg value={fontScale} options={fontOptions} onChange={setFontScale} />
      </Row>

      <Row label={t('pref.highContrast')}>
        <Toggle
          on={contrast === 'high'}
          label={t(contrast === 'high' ? 'pref.contrastOn' : 'pref.contrastOff')}
          onClick={() => setContrast((contrast === 'high' ? 'normal' : 'high') as Contrast)}
        />
      </Row>

      <Row label={t('pref.motion')}>
        <Toggle
          on={reduceMotion}
          label={t(reduceMotion ? 'pref.motionOn' : 'pref.motionOff')}
          onClick={() => setReduceMotion(!reduceMotion)}
        />
      </Row>
    </div>
  );

  if (inline) {
    return (
      <div className="rounded-xl border border-ink-200/70 p-3 max-w-md">
        <div className="flex items-center gap-2 mb-1 text-sm font-medium text-ink-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('pref.title')}
        </div>
        {panel}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${base}`}
        title={t('pref.title')}
        aria-label={t('pref.title')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && panel}
    </div>
  );
}
