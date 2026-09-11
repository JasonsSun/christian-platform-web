'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-rose-50 flex items-center justify-center">
          <svg className="w-10 h-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>

        <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900 mb-3">
          出了点小问题
        </h1>
        <p className="text-ink-500 mb-2">
          页面加载时遇到了错误，请稍后重试。
        </p>
        {process.env.NODE_ENV === 'development' && error?.message && (
          <p className="text-xs text-rose-500 font-mono bg-rose-50 rounded-lg px-3 py-2 mb-6 text-left max-w-md mx-auto break-all">
            {error.message}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <button onClick={reset} className="btn-primary px-6 py-3">
            重试
          </button>
          <Link href="/" className="btn-secondary px-6 py-3">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
