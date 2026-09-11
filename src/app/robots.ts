import type { MetadataRoute } from 'next';

/**
 * robots.txt：默认允许全站抓取，管理后台与 API 禁止。
 * 站点地址用环境变量 SITE_URL，缺省回退到本地开发地址。
 */
const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/login', '/me', '/messages', '/confirm'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
