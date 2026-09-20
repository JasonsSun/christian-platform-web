'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Variant } from '@/lib/i18n/config';

const VARIANT_LABEL: Record<Variant, string> = { s: '简', t: '繁' };
const VARIANT_FULL: Record<Variant, string> = { s: '简体', t: '繁體' };

export default function VariantSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { variant, setVariant } = useI18n();
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
        className={`inline-flex items-center justify-center gap-1 min-h-[44px] px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${base}`}
        title="简繁切换"
        aria-label="切换简体或繁体"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 5h11M4 9h7M4 13h9m9-8h-9m9 4h-6m9 4h-7m7 4h-4m0 0c0 1.2-1 2-2.5 2S15 19.2 15 18m0 0c0-1.2 1-2 2.5-2S20 16.8 20 18"
          />
        </svg>
        <span>{VARIANT_LABEL[variant]}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-28 bg-white rounded-2xl shadow-pop border border-ink-100 py-2 overflow-hidden z-50">
          {(['s', 't'] as Variant[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                setVariant(v);
                setOpen(false);
              }}
              className={`block w-full min-h-[44px] text-left px-4 py-2.5 text-sm transition-colors ${
                v === variant ? 'text-primary-600 bg-primary-50 font-medium' : 'text-ink-700 hover:bg-ink-100'
              }`}
              aria-current={v === variant}
            >
              {VARIANT_FULL[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
