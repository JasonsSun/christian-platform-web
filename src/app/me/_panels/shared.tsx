'use client';

import Link from 'next/link';

/** 个人中心各面板共用的占位/空态小部件(从 1498 行的 me/page.tsx 拆出) */

export function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-ink-100" />))}
    </div>
  );
}

export function ErrorBlock({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12">
      <p className="text-rose-600 mb-3">{msg}</p>
      <button onClick={onRetry} className="btn-secondary">重试</button>
    </div>
  );
}

export function EmptyBlock({ text, action }: { text: string; action: { label: string; href: string } }) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">📭</div>
      <p className="text-ink-500 mb-4">{text}</p>
      <Link href={action.href} className="btn-primary">{action.label}</Link>
    </div>
  );
}
