import type { MetadataRoute } from 'next';

/**
 * PWA manifest：允许用户"添加到主屏幕"，以类原生体验打开。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '圣约社区 - 基督教内容传播与社交社区',
    short_name: '圣约社区',
    description: '圣经·诗歌·见证·活动·团契·社区 - 连接信徒，传播福音，建立团契',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f7f4',
    theme_color: '#1e2664',
    lang: 'zh-CN',
    orientation: 'portrait',
    categories: ['social', 'lifestyle', 'books'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
