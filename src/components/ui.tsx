'use client';

import React from 'react';

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <div className="py-16 text-center text-ink-400">{label}</div>;
}

/* 空态的三条层次：label 说「这里为什么是空的」，hint 说「那我去哪」，children 就是那条路。
   只有 label 时和原来一模一样（全站几十处空态的观感不受影响）。
   hint 用 ink-500 而不是跟 label 同色的 ink-400：后者在白底上只有 2.4，
   当占位提示勉强够，当「指引你下一步」的正文就不够了。 */
export function Empty({
  label = '暂无数据',
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-4 text-center border border-dashed border-ink-200 rounded-2xl">
      <div className="text-ink-400">{label}</div>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-ink-500">{hint}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="py-10 text-center rounded-2xl bg-rose-50 text-rose-700">
      <div>{message || '加载失败'}</div>
      {onRetry ? (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
