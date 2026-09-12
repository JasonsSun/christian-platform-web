'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 要分享的链接,默认取当前页面地址 */
  url?: string;
  /** 分享标题,默认「圣约社区」 */
  title?: string;
  /** 分享文案,默认一段推荐语 */
  text?: string;
};

export default function ShareModal({ open, onClose, url, title, text }: Props) {
  // 分享链接只在挂载时解析一次,避免渲染期反复读取 window.location 造成依赖抖动
  const [shareUrl, setShareUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  const shareTitle = title || '圣约社区 - 基督教内容传播与社交社区';
  const shareText = text || '推荐给你一个基督徒的灵修与团契社区：读经、圣诗、见证、活动、直播，欢迎来一起建造。';

  // 解析分享链接:显式传入优先,否则取当前页面地址(仅在客户端执行一次)
  useEffect(() => {
    if (url) { setShareUrl(url); return; }
    if (typeof window !== 'undefined') setShareUrl(window.location.href);
  }, [url, open]);

  // 打开时生成二维码
  useEffect(() => {
    if (!open || !shareUrl) return;
    let alive = true;
    import('qrcode')
      .then((mod) => mod.default.toDataURL(shareUrl, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e2664', light: '#ffffff' },
      }))
      .then((u) => { if (alive) setQr(u); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [open, shareUrl]);

  // 关闭时复位复制状态
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  const nativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch {
        /* 用户取消分享 */
      }
    } else {
      await copy();
    }
  };

  return (
    <div
      data-guard="share-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* 遮罩:仅在点击遮罩自身时关闭 */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* 面板 */}
      <div className="relative glass rounded-3xl p-6 sm:p-8 shadow-card-hover max-w-sm w-full">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg" aria-hidden="true">📤</span>
          <h2 className="font-display text-lg font-bold text-ink-900">推荐给朋友</h2>
        </div>
        <p className="text-sm text-ink-500 mb-5">扫码或复制链接，把圣约社区分享给主内肢体</p>

        {/* 二维码 */}
        <div className="flex flex-col items-center mb-5">
          <div className="bg-white rounded-2xl p-3 shadow-soft border border-ink-100">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" src={qr} alt="分享二维码" className="w-48 h-48" width={192} height={192} />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-ink-300 text-sm">生成中…</div>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-2 break-all text-center max-w-[16rem]">{shareUrl}</p>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={copy}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? '已复制 ✓' : '复制链接'}
          </button>
          <button
            type="button"
            onClick={nativeShare}
            className="w-full py-2.5 rounded-xl border border-ink-200 bg-white/70 text-ink-700 font-medium text-sm hover:bg-ink-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            系统分享
          </button>
        </div>
      </div>
    </div>
  );
}
