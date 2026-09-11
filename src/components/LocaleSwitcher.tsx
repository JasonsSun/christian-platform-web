'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LOCALES } from '@/lib/i18n/config';

const LANG_LABEL: Record<string, string> = { zh: '中文', en: 'EN' };

export default function LocaleSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const base =
    tone === 'light'
      ? 'text-white/85 hover:text-white hover:bg-white/10'
      : 'text-ink-600 hover:text-primary-600 hover:bg-primary-50';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${base}`}
        title="语言 / Language"
        aria-label="切换语言"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m-3 9l3 3 3-3M3 14h6m4-4v8m0 0c0 1.5 1 2 2.5 2S19 20.5 19 19m0 0c0-1.5-1-2-2.5-2S14 17.5 14 19"
          />
        </svg>
        <span>{LANG_LABEL[locale]}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-card border border-ink-100 py-2 overflow-hidden z-50">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                l === locale ? 'text-primary-600 bg-primary-50 font-medium' : 'text-ink-700 hover:bg-ink-100'
              }`}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
