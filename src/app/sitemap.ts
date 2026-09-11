import type { MetadataRoute } from 'next';

/**
 * sitemap.xml：只收录公开、无需登录的页面。
 * 登录态页面（/me、/messages、/admin 等）不进 sitemap。
 */
const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicPaths: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'daily' },
    { path: '/bible', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/songs', priority: 0.9, changeFrequency: 'daily' },
    { path: '/community', priority: 0.8, changeFrequency: 'daily' },
    { path: '/feed', priority: 0.8, changeFrequency: 'daily' },
    { path: '/activities', priority: 0.8, changeFrequency: 'daily' },
    { path: '/groups', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/prayers', priority: 0.7, changeFrequency: 'daily' },
    { path: '/live', priority: 0.7, changeFrequency: 'daily' },
    { path: '/media', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/search', priority: 0.5, changeFrequency: 'weekly' },
    { path: '/donate', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/donate/transparency', priority: 0.4, changeFrequency: 'weekly' },
    { path: '/nearby', priority: 0.4, changeFrequency: 'weekly' },
  ];

  return publicPaths.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
