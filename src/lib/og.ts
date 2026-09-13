import type { Metadata } from 'next';

export type OgCardInput = {
  /** 分享卡主标题 */
  title: string;
  /** 摘要/副文本（可选） */
  description?: string;
  /** 右上角类型标签，如「见证」「诗歌」 */
  kind?: string;
  /** 左下角出处，如「约翰福音 3:16」 */
  meta?: string;
  /** 当前页面路径，用于 canonical / og:url */
  path: string;
};

/**
 * 生成详情页的分享元信息：og:image 指向动态生成的卡片图 /api/og。
 * 统一走这里，保证所有详情页分享出去都有像样的预览图。
 */
export function ogCardMetadata({ title, description, kind, meta, path }: OgCardInput): Metadata {
  const qs = new URLSearchParams();
  qs.set('t', title.slice(0, 60));
  if (description) qs.set('s', description.slice(0, 110));
  if (kind) qs.set('k', kind);
  if (meta) qs.set('m', meta.slice(0, 44));

  // 用绝对地址：爬虫/社交平台对相对 og:image 的解析依赖请求 Host，
  // 走 nginx/CDN 时可能出现内部主机名，统一固定为站点权威域名最稳。
  const site = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://amen.dpdns.org'
  ).replace(/\/$/, '');
  const image = `${site}/api/og?${qs.toString()}`;
  const desc = description || undefined;

  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title,
      description: desc,
      url: path,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [image],
    },
  };
}
