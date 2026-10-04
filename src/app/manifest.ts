import type { MetadataRoute } from 'next';

/**
 * PWA manifest：允许用户"添加到主屏幕"，以类原生体验打开。
 * 可安装性要求（Chrome）：manifest + Service Worker + 至少 192 与 512 的 PNG 图标。
 * iOS 添加到主屏走 apple-touch-icon（见 app/layout.tsx 的 icons.apple）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '圣约社区 - 基督教内容传播与社交社区',
    short_name: '圣约社区',
    description: '圣经·诗歌·见证·活动·团契·社区 - 连接信徒，传播福音，建立团契',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#f8f7f4',
    theme_color: '#1e2664',
    lang: 'zh-CN',
    dir: 'ltr',
    orientation: 'portrait',
    categories: ['social', 'lifestyle', 'books'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '读圣经', short_name: '圣经', url: '/bible', description: '进入圣经阅读' },
      { name: '赞美诗歌', short_name: '诗歌', url: '/songs', description: '进入诗歌库' },
      { name: '直播', short_name: '直播', url: '/live', description: '观看直播与回放' },
    ],
  };
}
