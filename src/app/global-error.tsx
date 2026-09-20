'use client';

/**
 * 根级兜底：当 RootLayout 自身渲染失败时（此时 globals.css 不会加载），
 * 必须自带 <html>/<body> 且只用内联样式，保证任何情况下都有可读页面。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f6f7fb',
          color: '#1f2339',
          fontFamily:
            'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
          padding: '24px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ marginBottom: 16 }}
          >
            <path d="M6.5 17.5c3.6 1.6 8.6.4 10.8-3.2" />
            <path d="M17.3 14.3c1.4-3.6-.4-7.4-3.4-9.1" />
            <path d="M13.9 5.2a2 2 0 00-2.7 1.2L9.6 11l-4 1.6a1 1 0 00-.1 1.8l3 1.6" />
            <path d="M13.9 5.2l3.6 1.2" />
            <path d="M9.6 11l4.3 1.8" />
          </svg>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>应用暂时不可用</h1>
          <p style={{ fontSize: 14, color: '#6b73a0', lineHeight: 1.7, margin: '0 0 24px' }}>
            页面加载时遇到了问题，请刷新重试。若持续出现，请稍后再访问。
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 22px',
              borderRadius: 12,
              border: 'none',
              background: '#4f6df5',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
          {error?.digest ? (
            <p style={{ marginTop: 22, fontSize: 11, color: '#9ba3c4' }}>
              问题编号 {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
