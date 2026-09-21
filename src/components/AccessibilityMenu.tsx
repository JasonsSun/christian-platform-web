'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useA11y, useDialogFocus, useEscape, type FontScale } from '@/lib/a11y';

export default function AccessibilityMenu({ tone = 'dark', align = 'right', up = false }: { tone?: 'dark' | 'light'; align?: 'left' | 'right'; up?: boolean }) {
  const { t } = useI18n();
  const { fontScale, contrast, reduceMotion, setFontScale, setContrast, setReduceMotion } = useA11y();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEscape(open, () => setOpen(false));
  // 非模态下拉：不圈养 Tab（背景页本来就该可达），只要关闭后焦点回到触发按钮
  const dlgRef = useDialogFocus<HTMLDivElement>(open, { trap: false, autofocus: false });

  const base =
    tone === 'light'
      ? 'text-white/85 hover:text-white hover:bg-white/10'
      : 'text-ink-600 hover:text-primary-600 hover:bg-primary-50';

  const fontOptions: { value: FontScale; label: string }[] = [
    { value: 'normal', label: t('pref.normal') },
    { value: 'lg', label: t('pref.lg') },
    { value: 'xl', label: t('pref.xl') },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center w-11 h-11 rounded-lg transition-colors ${base}`}
        title={t('pref.a11yTitle')}
        aria-label={t('pref.a11yTitle')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M12 8v5m0 0l-3 7m3-7l3 7" />
        </svg>
      </button>
      {open && (
        <div
          ref={dlgRef}
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} ${up ? 'bottom-full mb-2' : 'mt-2'} w-64 bg-white rounded-2xl shadow-pop border border-ink-100 p-4 z-50 text-ink-800`}
          role="dialog"
          aria-label={t('pref.a11yPanel')}
          data-guard="a11y-menu"
        >
          <p className="text-xs font-semibold text-ink-500 mb-2">{t('pref.fontSizeLabel')}</p>
          <div className="flex gap-2 mb-4">
            {fontOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setFontScale(o.value)}
                className={`flex-1 min-h-[44px] py-2 rounded-lg text-sm border transition-colors ${
                  fontScale === o.value
                    ? 'border-primary-500 bg-primary-50 text-primary-600 font-medium'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-100'
                }`}
                aria-pressed={fontScale === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-ink-500 mb-2">{t('pref.highContrast')}</p>
          <button
            onClick={() => setContrast(contrast === 'high' ? 'normal' : 'high')}
            className={`w-full min-h-[44px] py-2 rounded-lg text-sm border transition-colors mb-4 ${
              contrast === 'high'
                ? 'border-primary-500 bg-primary-50 text-primary-600 font-medium'
                : 'border-ink-200 text-ink-600 hover:bg-ink-100'
            }`}
            aria-pressed={contrast === 'high'}
          >
            {t(contrast === 'high' ? 'pref.contrastOn' : 'pref.contrastOff')}
          </button>

          <p className="text-xs font-semibold text-ink-500 mb-2">{t('pref.motion')}</p>
          <button
            onClick={() => setReduceMotion(!reduceMotion)}
            className={`w-full min-h-[44px] py-2 rounded-lg text-sm border transition-colors ${
              reduceMotion
                ? 'border-primary-500 bg-primary-50 text-primary-600 font-medium'
                : 'border-ink-200 text-ink-600 hover:bg-ink-100'
            }`}
            aria-pressed={reduceMotion}
          >
            {t(reduceMotion ? 'pref.motionOn' : 'pref.motionOff')}
          </button>
        </div>
      )}
    </div>
  );
}
