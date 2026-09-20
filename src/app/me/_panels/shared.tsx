'use client';

import Link from 'next/link';
import { IconAlert, IconInbox } from '@/components/icons';

/** 个人中心各面板共用的占位/空态小部件(从 1498 行的 me/page.tsx 拆出) */

export function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 gap-4" role="status" aria-label="加载中">
      {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-24 skeleton-sheen border border-ink-100" />))}
    </div>
  );
}

export function ErrorBlock({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12 rounded-2xl border border-ink-100 bg-white">
      <span className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
        <IconAlert className="w-7 h-7" strokeWidth={1.6} />
      </span>
      <p className="text-rose-700 mb-4 text-sm">{msg}</p>
      <button onClick={onRetry} className="btn-secondary">重试</button>
    </div>
  );
}

export function EmptyBlock({ text, action }: { text: string; action: { label: string; href: string } }) {
  return (
    <div className="text-center py-12 rounded-2xl border border-dashed border-ink-200 bg-white">
      <span className="w-14 h-14 rounded-2xl bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
        <IconInbox className="w-7 h-7" strokeWidth={1.6} />
      </span>
      <p className="text-ink-500 mb-4">{text}</p>
      <Link href={action.href} className="btn-primary">{action.label}</Link>
    </div>
  );
}
