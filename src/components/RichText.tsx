'use client';

import Link from 'next/link';
import { Fragment } from 'react';

/**
 * 轻量富文本：把纯文本里的 @提及 与 #话题 渲染成可点击链接。
 * - @username → /users/<username>（用户主页接口同时支持 id 与 username）
 * - #话题   → /community?q=<话题>（复用社区页的检索聚合）
 *
 * 安全：只做纯文本切分，不渲染任何 HTML，天然免疫 XSS。
 */
const TOKEN = /(@[A-Za-z0-9_\u4e00-\u9fa5-]{1,32}|#[A-Za-z0-9_\u4e00-\u9fa5-]{1,32})/g;

export default function RichText({ text, className }: { text?: string | null; className?: string }) {
  const raw = text || '';
  if (!raw) return null;

  return (
    <span className={className}>
      {raw.split(TOKEN).map((part, i) => {
        if (part.startsWith('@') && part.length > 1) {
          return (
            <Link
              key={i}
              href={`/users/${encodeURIComponent(part.slice(1))}`}
              className="text-primary-600 font-medium hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith('#') && part.length > 1) {
          return (
            <Link
              key={i}
              href={`/community?q=${encodeURIComponent(part.slice(1))}`}
              className="text-primary-600 font-medium hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
