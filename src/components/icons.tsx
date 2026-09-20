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

/* =====================================================================
   扩展图标（2026-09-21）
   全站有 60 多种 emoji 被当成 UI 图标用（🎵 投稿、💼 活动、📅 排期…）。
   emoji 在 Windows/Android 上渲染成彩色块，尺寸不可控、深色/护眼下不能随文字换色，
   和这套线性图标混在一起就是「廉价感」的主要来源。这里补齐常用档，
   并在文件末尾给出 EMOJI_ICON 映射：数据里带的 emoji（活动分类、模块名这类）
   在渲染时换成图标，不必回改数据库里的文案。
   ===================================================================== */

/** 多路径图标的简写：一个数组 = 一个组件，省掉几十个重复的 <svg> 壳。 */
const mk =
  (paths: string | string[]) =>
  (p: IconProps) =>
    base(
      p,
      (Array.isArray(paths) ? paths : [paths]).map((d, i) => <path key={i} d={d} />),
    );

/* —— 内容 / 媒体 —— */
export const IconBookOpen = mk(['M12 6.5C10.6 5.2 8.2 4.6 4.5 5a.5.5 0 00-.5.5v12.2c0 .3.2.5.5.5 3.7-.4 6.1.2 7.5 1.4 1.4-1.2 3.8-1.8 7.5-1.4a.5.5 0 00.5-.5V5.5a.5.5 0 00-.5-.5c-3.7-.4-6.1.2-7.5 1.5z', 'M12 6.5v13']);
export const IconBooks = mk(['M4 5.5A1.5 1.5 0 015.5 4H9v16H5.5A1.5 1.5 0 014 18.5v-13z', 'M9 4h4a1.5 1.5 0 011.5 1.5v13A1.5 1.5 0 0113 20H9', 'M15.6 6.3l3 .8a1 1 0 01.7 1.2l-3.1 11.2']);
export const IconBookMarked = mk(['M6 4.5A1.5 1.5 0 017.5 3H18a1 1 0 011 1v16a1 1 0 01-1 1H7.5A1.5 1.5 0 016 19.5v-15z', 'M16 3v8l-2.5-1.5L11 11V3']);
export const IconPencil = mk(['M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z', 'M13.5 6.5l3 3']);
export const IconPaperclip = mk(['M21 12.5l-8.2 8.2a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.5 3.5 0 015 5l-8.5 8.6a1.5 1.5 0 01-2.2-2.1l7.8-7.9']);
export const IconImage = mk(['M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13z', 'M4 16l4.5-4.5a2 2 0 012.8 0L16 16', 'M14.5 14.5l1.6-1.6a2 2 0 012.8 0L20 14', 'M9 9a1 1 0 100-2 1 1 0 000 2z']);
export const IconFilm = mk(['M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13z', 'M8 4v16', 'M16 4v16', 'M4 9h4', 'M4 15h4', 'M16 9h4', 'M16 15h4']);
export const IconCamera = mk(['M4 8.5A1.5 1.5 0 015.5 7h2.2l1.1-1.8a1 1 0 01.86-.5h4.68a1 1 0 01.86.5L16.3 7h2.2A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z', 'M12 16.2a3.1 3.1 0 100-6.2 3.1 3.1 0 000 6.2z']);
export const IconLaptop = mk(['M5 5.5h14a1 1 0 011 1V15H4V6.5a1 1 0 011-1z', 'M2.5 18.5h19L19.3 15H4.7l-2.2 3.5z']);
export const IconSmartphone = mk(['M8 3.5h8A1.5 1.5 0 0117.5 5v14a1.5 1.5 0 01-1.5 1.5H8A1.5 1.5 0 016.5 19V5A1.5 1.5 0 018 3.5z', 'M10.6 18.3h2.8']);
export const IconStop = mk(['M6.5 6.5h11v11h-11z']);
export const IconHeadphones = mk(['M4 14v-2a8 8 0 1116 0v2', 'M4 14a2 2 0 012-2h.6a1.4 1.4 0 011.4 1.4v3.2A1.4 1.4 0 016.6 18H6a2 2 0 01-2-2v-2z', 'M20 14a2 2 0 00-2-2h-.6a1.4 1.4 0 00-1.4 1.4v3.2A1.4 1.4 0 0017.4 18H18a2 2 0 002-2v-2z']);
export const IconSpeaker = mk(['M11 5.5L6.5 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2.5L11 18.5v-13z', 'M15.5 9.2a4 4 0 010 5.6', 'M18.2 6.5a8 8 0 010 11']);
export const IconSpeakerOff = mk(['M11 5.5L6.5 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2.5L11 18.5v-13z', 'M16 10l4 4', 'M20 10l-4 4']);
export const IconPiano = mk(['M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13z', 'M4 14h16', 'M8 4v10', 'M12 4v10', 'M16 4v10']);
export const IconBroadcast = mk(['M12 13.2a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z', 'M8.6 15.4a5 5 0 010-6.8', 'M15.4 8.6a5 5 0 010 6.8', 'M5.8 18.2a9 9 0 010-12.4', 'M18.2 5.8a9 9 0 010 12.4']);
export const IconMicWave = mk(['M12 3.5a2.6 2.6 0 012.6 2.6v5.8a2.6 2.6 0 11-5.2 0V6.1A2.6 2.6 0 0112 3.5z', 'M5 11a7 7 0 0014 0', 'M12 18v3', 'M8.5 21h7']);
export const IconSkipBack = mk(['M18 5.5v13L8.5 12 18 5.5z', 'M6 5v14']);
export const IconSkipForward = mk(['M6 5.5v13L15.5 12 6 5.5z', 'M18 5v14']);
export const IconShuffle = mk(['M16 3.5h4.5V8', 'M4 20L20.5 3.5', 'M20.5 16v4.5H16', 'M14.6 14.6l5.9 5.9', 'M4 3.5l5 5']);

/* —— 时间 / 日程 —— */
export const IconCalendar = mk(['M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11A2.5 2.5 0 0117.5 20h-11A2.5 2.5 0 014 17.5v-11z', 'M8 3v3', 'M16 3v3', 'M4 9.5h16']);
export const IconClock = mk(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7.5V12l3 2']);
export const IconRefresh = mk(['M20 11a8 8 0 10-1.2 5', 'M20 5v6h-6']);
export const IconHourglass = mk(['M6 4h12', 'M6 20h12', 'M7.5 4v3.2a4 4 0 002.4 3.6l.6.2v.2l-.6.2a4 4 0 00-2.4 3.6V20', 'M16.5 4v3.2a4 4 0 01-2.4 3.6l-.6.2v.2l.6.2a4 4 0 012.4 3.6V20']);

/* —— 人物 / 关系 —— */
export const IconUser = mk(['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4.5 20a7.5 7.5 0 0115 0']);
export const IconUsers = mk(['M9 12a3.6 3.6 0 100-7.2A3.6 3.6 0 009 12z', 'M2.8 20a6.4 6.4 0 0112.4 0', 'M16.5 5.2a3.4 3.4 0 010 6.6', 'M17.6 14.2A5.6 5.6 0 0121 19.4']);
export const IconHandshake = mk(['M7.5 13.5l2.6 2.6a1.6 1.6 0 002.3 0l.6-.6', 'M3 9.5L6.5 6h4l2 2 2-2h3L21 9.5', 'M21 9.5l-3.6 3.6a1.6 1.6 0 01-2.3 0', 'M6.5 6v9', 'M17.5 6v9', 'M9.5 16.5l1.2 1.2a1.6 1.6 0 002.3 0l.6-.6']);
export const IconPray = mk(['M12 3.5c-1.6 1.4-2.6 3.3-2.6 5.4V19h5.2V8.9c0-2.1-1-4-2.6-5.4z', 'M9.4 11.5H6.2a1 1 0 00-1 1v6.5', 'M14.6 11.5h3.2a1 1 0 011 1v6.5', 'M5.2 19h13.6']);
export const IconDove = mk(['M6.5 17.5c3.6 1.6 8.6.4 10.8-3.2', 'M17.3 14.3c1.4-3.6-.4-7.4-3.4-9.1', 'M13.9 5.2a2 2 0 00-2.7 1.2L9.6 11l-4 1.6a1 1 0 00-.1 1.8l3 1.6', 'M13.9 5.2l3.6 1.2', 'M9.6 11l4.3 1.8']);
export const IconCross = mk(['M12 3v18', 'M7 8h10']);
export const IconChurch = mk(['M12 2.5v4', 'M10 4.5h4', 'M12 6.5l5.5 3.2V20h-11V9.7L12 6.5z', 'M8.5 20v-4.5h3V20', 'M4 20h16']);
export const IconCandle = mk(['M12 3.5c1.2 1.1 1.8 2 1.8 2.9a1.8 1.8 0 11-3.6 0c0-.9.6-1.8 1.8-2.9z', 'M9.5 9.5h5V20h-5v-10.5z', 'M7 20h10']);
export const IconAngel = mk(['M12 8a2.4 2.4 0 100-4.8A2.4 2.4 0 0012 8z', 'M12 8.6c-1.8 1.2-2.8 3-2.8 5.2V20h5.6v-6.2c0-2.2-1-4-2.8-5.2z', 'M9.2 11.5C7 10.6 4.8 11 3.5 12.6c1.8.4 3.4.2 4.8-.5', 'M14.8 11.5c2.2-.9 4.4-.5 5.7 1.1-1.8.4-3.4.2-4.8-.5']);

/* —— 通知 / 状态 —— */
export const IconBell = mk(['M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z', 'M10.5 19a1.8 1.8 0 003 0']);
export const IconBellOff = mk(['M8.6 4.9A6 6 0 0118 9c0 2.2.3 3.7.7 4.7', 'M5.9 6.6C5.3 7.4 5 8.2 5 9c0 5-2 6-2 6h12', 'M10.5 19a1.8 1.8 0 003 0', 'M3 3l18 18']);
export const IconInbox = mk(['M3.5 13.5h4l1.2 2.2a1 1 0 00.9.5h4.8a1 1 0 00.9-.5l1.2-2.2h4', 'M6.4 4.8h11.2a1.5 1.5 0 011.4 1l2.5 7.2v4a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 014 17v-4l2.5-7.2a1.5 1.5 0 011.4-1z']);
export const IconCheckCircle = mk(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M8 12.5l2.6 2.5L16 9.5']);
export const IconAlert = mk(['M12 4.2L2.8 20h18.4L12 4.2z', 'M12 10v4', 'M12 17h.01']);
export const IconBan = mk(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M5.6 5.6l12.8 12.8']);
export const IconFlag = mk(['M5 21V4.5', 'M5 5h11.5l-2 3.5 2 3.5H5']);
export const IconShield = mk(['M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1l7-2.6z', 'M9.2 12.2l2 2 3.6-3.9']);
export const IconLock = mk(['M6.5 10.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1z', 'M8.6 10.5V7.8a3.4 3.4 0 016.8 0v2.7', 'M12 14v2.5']);
export const IconKey = mk(['M14.5 9.5a3.5 3.5 0 113.5 3.5', 'M17.2 12.2L4 20l1.5-4 9.4-6.4', 'M8.5 15.5l2 2']);
export const IconLogout = mk(['M15 5.5h3.5A1.5 1.5 0 0120 7v10a1.5 1.5 0 01-1.5 1.5H15', 'M11 8l-3 4 3 4', 'M8 12h9']);
export const IconSpark = mk(['M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12l1-7.5z']);
export const IconFire = mk(['M12 21c3.9 0 6.5-2.5 6.5-6 0-4.5-4-6-4-10.5-3 1.5-3.6 4.2-3.4 6.3-1-.6-1.7-1.7-1.9-3.1C7 5.9 5.5 8.6 5.5 12c0 4.9 2.6 9 6.5 9z', 'M12 21c-1.7 0-2.9-1.4-2.9-3.1 0-2 1.5-2.8 2.9-4.9 1.4 2.1 2.9 2.9 2.9 4.9 0 1.7-1.2 3.1-2.9 3.1z']);
export const IconTrophy = mk(['M8 4h8v5a4 4 0 11-8 0V4z', 'M8 5.5H5.5V8a3 3 0 003 3', 'M16 5.5h2.5V8a3 3 0 01-3 3', 'M12 13v4', 'M8.5 20h7l-.7-3h-5.6l-.7 3z']);
export const IconCrown = mk(['M4 17.5l1.2-9 4 3.4L12 6l2.8 5.9 4-3.4L20 17.5H4z', 'M4 20h16']);
export const IconGift = mk(['M4 10.5h16V20H4v-9.5z', 'M12 10.5V20', 'M3 7h18v3.5H3V7z', 'M12 7c-1.6-3-5.5-2.6-5.5 0H12z', 'M12 7c1.6-3 5.5-2.6 5.5 0H12z']);
export const IconChart = mk(['M4 20h16', 'M7 20v-6', 'M12 20V8', 'M17 20v-9']);
export const IconTrend = mk(['M3 17l6-6 4 4 8-8', 'M15 7h6v6']);
export const IconTarget = mk(['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z', 'M12 13.2a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z']);
export const IconMapPin = mk(['M12 21s6.5-6 6.5-10.5a6.5 6.5 0 10-13 0C5.5 15 12 21 12 21z', 'M12 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z']);
export const IconMap = mk(['M9 4.5L3.5 6.8V19.5L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5z', 'M9 4.5v12.7', 'M15 6.8v12.7']);
export const IconBriefcase = mk(['M4 9.5h16a1 1 0 011 1V19a1 1 0 01-1 1H4a1 1 0 01-1-1v-8.5a1 1 0 011-1z', 'M8.5 9.5V6a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0115.5 6v3.5', 'M3 13.5h18']);
export const IconWallet = mk(['M3.5 7.5A1.5 1.5 0 015 6h12.5', 'M3.5 7.5V17a1.5 1.5 0 001.5 1.5h14a1 1 0 001-1v-3', 'M3.5 7.5h14a1 1 0 011 1v3h-4.2a2.4 2.4 0 000 4.8H20']);
export const IconSettings = mk(['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a1.9 1.9 0 01-2.7 2.7l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a1.9 1.9 0 01-3.8 0v-.2a1.6 1.6 0 00-2.7-1.1l-.1.1a1.9 1.9 0 01-2.7-2.7l.1-.1A1.6 1.6 0 003 15H2.8a1.9 1.9 0 010-3.8H3a1.6 1.6 0 001.1-2.7l-.1-.1a1.9 1.9 0 012.7-2.7l.1.1A1.6 1.6 0 009.6 4.2V4a1.9 1.9 0 013.8 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a1.9 1.9 0 012.7 2.7l-.1.1a1.6 1.6 0 001.1 2.7h.2a1.9 1.9 0 010 3.8H21a1.6 1.6 0 00-1.6 1z']);
export const IconFilter = mk(['M4 5.5h16l-6.2 7.2V19L10 20.5v-7.8L4 5.5z']);
export const IconFolder = mk(['M3.5 6.5A1.5 1.5 0 015 5h4l2 2.5h8A1.5 1.5 0 0121.5 9v9A1.5 1.5 0 0120 19.5H5a1.5 1.5 0 01-1.5-1.5v-11.5z']);
export const IconDownload = mk(['M12 4v11', 'M8 11.5l4 4 4-4', 'M4.5 19.5h15']);
export const IconTag = mk(['M4 5.5A1.5 1.5 0 015.5 4h6.2a1.5 1.5 0 011.06.44l6.8 6.8a1.5 1.5 0 010 2.12l-6.2 6.2a1.5 1.5 0 01-2.12 0l-6.8-6.8A1.5 1.5 0 014 11.7V5.5z', 'M8.2 8.2h.01']);
export const IconMail = mk(['M3.5 6.5A1.5 1.5 0 015 5h14a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5v-11z', 'M4 7l8 6 8-6']);
export const IconChat = mk(['M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L4 20.5l1.6-4A6.6 6.6 0 014 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z']);
export const IconChatDots = mk(['M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L4 20.5l1.6-4A6.6 6.6 0 014 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z', 'M8.8 12.5h.01', 'M12 12.5h.01', 'M15.2 12.5h.01']);
export const IconLightbulb = mk(['M9.5 17.5h5', 'M10.5 20.5h3', 'M12 3.5a5.5 5.5 0 00-3.2 9.9c.6.5 1 1.2 1.1 2h4.2c.1-.8.5-1.5 1.1-2A5.5 5.5 0 0012 3.5z']);
export const IconLeaf = mk(['M20 4c-9 0-15 3.5-15 10a6 6 0 001.5 4C9 13 13 10 17.5 9', 'M4.5 20c1-4.5 4-7.5 8.5-9']);
export const IconHome = mk(['M4 10.5L12 4l8 6.5', 'M6 9.5V20h12V9.5', 'M10 20v-5.5h4V20']);
export const IconGrad = mk(['M2.5 9L12 5l9.5 4L12 13 2.5 9z', 'M6.5 11v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V11', 'M21.5 9v5']);
export const IconRainbow = mk(['M3 18a9 9 0 0118 0', 'M6.5 18a5.5 5.5 0 0111 0', 'M10 18a2 2 0 014 0']);
export const IconFlower = mk(['M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z', 'M12 8.5C12 5 10 3.5 8.2 4.2 6.5 4.9 6.8 7.6 9 8.7', 'M12 8.5c0-3.5 2-5 3.8-4.3 1.7.7 1.4 3.4-.8 4.5', 'M12 15.5c0 3.5-2 5-3.8 4.3-1.7-.7-1.4-3.4.8-4.5', 'M12 15.5c0 3.5 2 5 3.8 4.3 1.7-.7 1.4-3.4-.8-4.5']);
export const IconSprout = mk(['M12 20.5V13', 'M12 14c0-3.3 2.4-5.5 6-5.5 0 3.3-2.4 5.5-6 5.5z', 'M12 15.2c0-2.7-2-4.7-5-4.7 0 2.7 2 4.7 5 4.7z']);
export const IconTree = mk(['M12 20.5V15', 'M12 15a5.5 5.5 0 110-11 5.5 5.5 0 010 11z', 'M9.4 10.2l2.6-2.6 2.6 2.6']);
export const IconGrapes = mk(['M12 6.6a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8z', 'M8.9 10.4a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8z', 'M15.1 10.4a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8z', 'M12 14.2a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8z', 'M12 6.6V4.2', 'M12 4.4c1.5-1.3 3-1 3.5-.6']);
export const IconMountain = mk(['M3 18.5L9.2 7l3.6 6 2-3 6.2 8.5H3z', 'M8.4 12.6h1.6']);
export const IconDesert = mk(['M16.5 4.5a3 3 0 100 6 3 3 0 000-6z', 'M3 19c2.6-3.6 5.2-4 7.6-2.2', 'M9.6 17.4c2.8 1.6 7.4 1.2 11.4-2.4']);
export const IconParty = mk(['M4 20l3.2-9 5.8 5.8L4 20z', 'M14.5 4.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z', 'M19 12l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z']);
export const IconGrid = mk(['M4 4.5h6.5V11H4V4.5z', 'M13.5 4.5H20V11h-6.5V4.5z', 'M4 13.5h6.5V20H4v-6.5z', 'M13.5 13.5H20V20h-6.5v-6.5z']);
export const IconList = mk(['M8 6.5h12', 'M8 12h12', 'M8 17.5h12', 'M4 6.5h.01', 'M4 12h.01', 'M4 17.5h.01']);
export const IconSun = mk(['M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z', 'M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'M5.6 5.6l1.4 1.4', 'M17 17l1.4 1.4', 'M18.4 5.6L17 7', 'M7 17l-1.4 1.4']);
export const IconMoon = mk(['M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z']);
export const IconChevronDown = mk(['M6 9.5l6 6 6-6']);
export const IconChevronRight = mk(['M9.5 6l6 6-6 6']);
export const IconArrowRight = mk(['M4.5 12h15', 'M13.5 6l6 6-6 6']);
export const IconArrowUp = mk(['M12 19.5v-15', 'M6 10.5l6-6 6 6']);
export const IconArrowDown = mk(['M12 4.5v15', 'M18 13.5l-6 6-6-6']);
export const IconShare = mk(['M12 15V4.5', 'M8.5 8L12 4.5 15.5 8', 'M5.5 13.5H5a1.5 1.5 0 00-1.5 1.5v4A1.5 1.5 0 005 20.5h14a1.5 1.5 0 001.5-1.5v-4A1.5 1.5 0 0019 13.5h-.5']);
export const IconLocation = mk(['M12 21s6.5-6 6.5-10.5a6.5 6.5 0 10-13 0C5.5 15 12 21 12 21z']);
export const IconTrash = mk(['M4.5 7h15', 'M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7', 'M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L17.5 7']);
export const IconEyeOff = mk(['M4 4l16 16', 'M9.9 5.2A9.6 9.6 0 0112 5c5 0 9 5.5 9 7 0 .6-.7 1.9-1.9 3.2', 'M6.3 7.9C4.4 9.5 3 11.5 3 12c0 1.5 4 7 9 7 1.6 0 3-.5 4.2-1.2', 'M9.9 10.1a3 3 0 004.1 4.2']);
export const IconExpand = mk(['M4 9V4.5H9', 'M15 4.5h5V9', 'M20 15v4.5H15', 'M9 19.5H4V15']);
export const IconTemple = mk(['M4 9.5L12 5l8 4.5', 'M5.5 10v7.5', 'M9.5 10v7.5', 'M14.5 10v7.5', 'M18.5 10v7.5', 'M3.5 20.5h17']);
export const IconDroplet = mk(['M12 3.2l5.1 6.6a6.4 6.4 0 11-10.2 0L12 3.2z', 'M12 16.4a3.2 3.2 0 01-3.2-3.2']);

/**
 * 数据里的 emoji → 线性图标。
 * 活动分类、模块名这类文案存在库里（server/db.ts 与内容表），回改数据代价大且
 * 会影响已分享出去的快照；这里在渲染时换掉，未收录的仍按原文输出，不会丢信息。
 */
const EMOJI_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  '📖': IconBookOpen,
  '📚': IconBooks,
  '🎵': IconMusicNote,
  '🎶': IconMusicNote,
  '🎼': IconMusicNote,
  '🎤': IconMicWave,
  '🎧': IconHeadphones,
  '🔊': IconSpeaker,
  '🔇': IconSpeakerOff,
  '🎹': IconPiano,
  '📡': IconBroadcast,
  '📅': IconCalendar,
  '🕐': IconClock,
  '⏰': IconClock,
  '📄': IconDocument,
  '📝': IconPencil,
  '📎': IconPaperclip,
  '🖼': IconImage,
  '🎬': IconFilm,
  '📷': IconCamera,
  '💻': IconLaptop,
  '📱': IconSmartphone,
  '⏹': IconStop,
  '🔁': IconRefresh,
  '🔂': IconTarget,
  '🔀': IconShuffle,
  '👥': IconUsers,
  '🙏': IconPray,
  '🕊': IconDove,
  '⛪': IconChurch,
  '✝': IconCross,
  '🕯': IconCandle,
  '👼': IconAngel,
  '🤝': IconHandshake,
  '🔔': IconBell,
  '🔕': IconBellOff,
  '📭': IconInbox,
  '💬': IconChatDots,
  '✉': IconMail,
  '🗣': IconMicWave,
  '✅': IconCheckCircle,
  '✓': IconCheck,
  '✕': IconClose,
  '⚠': IconAlert,
  '🚫': IconBan,
  '🚩': IconFlag,
  '🛡': IconShield,
  '🔒': IconLock,
  '🔐': IconKey,
  '🔑': IconKey,
  '🔥': IconFire,
  '👑': IconCrown,
  '🎁': IconGift,
  '🎉': IconParty,
  '💡': IconLightbulb,
  '🌿': IconLeaf,
  '🌸': IconFlower,
  '🌈': IconRainbow,
  '🌱': IconSprout,
  '🌳': IconTree,
  '🍇': IconGrapes,
  '⛰': IconMountain,
  '🏜': IconDesert,
  '🗓': IconCalendar,
  '🫂': IconUsers,
  '🏠': IconHome,
  '🎓': IconGrad,
  '🌟': IconStar,
  '💛': IconHeart,
  '📤': IconShare,
  '⛶': IconExpand,
  '✨': IconSparkles,
  '⭐': IconStar,
  '★': IconStar,
  '☆': IconStar,
  '❤': IconHeart,
  '♥': IconHeart,
  '🏆': IconTrophy,
  '📊': IconChart,
  '📈': IconTrend,
  '🎯': IconTarget,
  '📍': IconMapPin,
  '🗺': IconMap,
  '💼': IconBriefcase,
  '💰': IconWallet,
  '⚙': IconSettings,
  '🔍': IconSearch,
  '🔗': IconLink,
  '📁': IconFolder,
  '🏷': IconTag,
  '⬇': IconDownload,
  '🔽': IconChevronDown,
  '☀': IconSun,
  '🌙': IconMoon,
  '👁': IconEye,
  '⏳': IconHourglass,
  '⛔': IconBan,
  '🎪': IconParty,
  '🎺': IconMusicNote,
  '🏛': IconTemple,
  '👋': IconLogout,
  '👤': IconUser,
  '💍': IconHeart,
  '💔': IconHeart,
  '💝': IconGift,
  '💧': IconDroplet,
  '📺': IconBroadcast,
  '🗑': IconTrash,
  '🚀': IconSpark,
};

/** 把可能是 emoji 的字符换成同语义 SVG；未收录时退回原文，绝不渲染成空白。 */
export function Glyph({
  glyph,
  className = 'w-5 h-5',
  strokeWidth,
  style,
}: {
  glyph: string;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const key = glyph.replace(/\uFE0F/g, '').trim();
  const Cmp = EMOJI_ICON[key];
  return Cmp ? <Cmp className={className} strokeWidth={strokeWidth} style={style} /> : <span aria-hidden="true" style={style}>{glyph}</span>;
}