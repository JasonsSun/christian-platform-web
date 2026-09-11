'use client';

import { useState } from 'react';
import ShareModal from '@/components/ShareModal';

type Props = {
  /** 要分享的链接,默认取当前页面地址 */
  url?: string;
  /** 分享标题 */
  title?: string;
  /** 分享文案 */
  text?: string;
  /** 图标按钮样式类(由调用方按所在页面配色传入) */
  className?: string;
  /** 图标按钮 aria-label */
  label?: string;
  /** 是否显示为带文字的按钮(默认纯图标) */
  withText?: boolean;
};

/**
 * 通用「分享」图标按钮:点击弹出 ShareModal(二维码/复制链接/系统分享)。
 * 用于内容详情页,让用户能把某一首诗歌/见证/活动/直播单独分享出去。
 */
export default function ShareButton({
  url,
  title,
  text,
  className,
  label = '分享',
  withText = false,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={label}
        title={label}
        className={className}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0V16.5a2.5 2.5 0 01-5 0v-.5"
          />
        </svg>
        {withText && <span className="ml-1.5">{label}</span>}
      </button>
      <ShareModal open={open} onClose={() => setOpen(false)} url={url} title={title} text={text} />
    </>
  );
}