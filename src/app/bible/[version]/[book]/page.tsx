'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import type { BibleMeta } from '@/lib/types';

export default function BookChapters() {
  const params = useParams();
  const version = (params.version as string) || 'cuv';
  const book = (params.book as string) || 'genesis';
  const { data, loading, error } = useApi<BibleMeta>('/bible');

  const versionMeta = data?.versions.find((v) => v.id === version);
  const avail = (data?.available[version] || {}) as Record<string, number[]>;
  const meta = data?.books.find((b) => b.id === book);
  const chapters = (avail[book] || []).slice().sort((a, b) => a - b);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-72 h-72 bg-gold-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-16 md:pb-14">
          <Link href={`/bible/${version}`} className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回 {versionMeta ? versionMeta.fullName : version}
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2">
            {meta ? meta.name : book}
          </h1>
          <p className="text-white/70 font-serif italic">
            {meta ? `${meta.abbr} · ${meta.testament === 'old' ? '旧约' : '新约'} · ${meta.chapters} 章` : '选择章节开始阅读'}
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 bg-ink-100 rounded-2xl" />
            ))}
          </div>
        ) : chapters.length > 0 ? (
          <>
            <p className="text-sm text-ink-500 mb-4">
              《{meta?.name ?? book}》共 {meta?.chapters ?? chapters.length} 章，已收录 {chapters.length} 章
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2.5">
              {chapters.map((ch) => (
                <Link
                  key={ch}
                  href={`/bible/${version}/${book}/${ch}`}
                  className="h-11 rounded-xl bg-white border border-ink-100 shadow-soft hover:shadow-card-hover hover:-translate-y-0.5 hover:border-primary-300 transition-all flex items-center justify-center text-primary-700 font-medium"
                >
                  {ch}
                </Link>
              ))}
            </div>
            <div className="mt-8">
              <Link href={`/bible/${version}/${book}/${chapters[0]}`} className="btn-primary px-6 py-2.5 text-sm">
                开始阅读 第 {chapters[0]} 章
              </Link>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
            <div className="text-5xl mb-4">📖</div>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">本书暂无该译本数据</h3>
            <p className="text-ink-500 mb-6">《{meta?.name ?? book}》在「{version}」译本中尚未收录章节。</p>
            <Link href={`/bible/${version}`} className="btn-primary px-5 py-2.5 text-sm">返回书卷列表</Link>
          </div>
        )}
      </div>
    </div>
  );
}