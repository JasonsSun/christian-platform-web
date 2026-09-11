'use client';

/**
 * 统一 SVG 图标库（Heroicons outline 风格，stroke 1.5~2）。
 * 全站复用：用 className 控制尺寸/颜色，避免 emoji 与文本字符图标在跨平台渲染风格不一。
 */
import React from 'react';

type IconProps = { className?: string; strokeWidth?: number; style?: React.CSSProperties; fill?: string };

function base(props: IconProps, children: React.ReactNode) {
  const { className = 'w-5 h-5', strokeWidth = 1.8, style } = props;
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* —— 音乐 / 播放 —— */
export const IconMusicNote = (p: IconProps) =>
  base(p, <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />);

export const IconPlay = (p: IconProps) => (
  <svg className={p.className ?? 'w-5 h-5'} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const IconPause = (p: IconProps) => (
  <svg className={p.className ?? 'w-5 h-5'} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);

/* —— 操作 / 通用 —— */
export const IconSearch = (p: IconProps) =>
  base(p, <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />);

export const IconPlus = (p: IconProps) => base(p, <path d="M12 4v16m8-8H4" />);

export const IconHeart = (p: IconProps) => {
  const { className = 'w-5 h-5', strokeWidth = 1.8, fill = 'none' } = p as IconProps & { fill?: string };
  return (
    <svg className={className} fill={fill} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
};

export const IconStar = (p: IconProps) =>
  base(p, <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />);

export const IconEye = (p: IconProps) => {
  const { className = 'w-5 h-5', strokeWidth = 1.8 } = p;
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
};

export const IconMicrophone = (p: IconProps) =>
  base(p, <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />);

export const IconArrowLeft = (p: IconProps) => base(p, <path d="M15 19l-7-7 7-7" />);

export const IconExternalLink = (p: IconProps) =>
  base(p, <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />);

export const IconUpload = (p: IconProps) =>
  base(p, <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />);

export const IconDocument = (p: IconProps) =>
  base(p, <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />);

export const IconLink = (p: IconProps) =>
  base(p, <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />);

export const IconClose = (p: IconProps) => base(p, <path d="M6 18L18 6M6 6l12 12" />);

export const IconCheck = (p: IconProps) => base(p, <path d="M5 13l4 4L19 7" />);

export const IconSparkles = (p: IconProps) =>
  base(p, <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />);