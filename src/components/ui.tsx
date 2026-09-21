'use client';

import React from 'react';

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <div className="py-16 text-center text-ink-400">{label}</div>;
}

export function Empty({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="py-12 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
      {label}
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
