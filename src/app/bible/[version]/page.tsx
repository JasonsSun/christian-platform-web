'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import type { BibleMeta, BibleBook } from '@/lib/types';

type GroupedBook = BibleBook & { chaptersAvailable: number[] };

export default function VersionBooks() {
  const params = useParams();
  const version = (params.version as string) || 'cuv';
  const { data, loading, error } = useApi<BibleMeta>('/bible');

  const versionMeta = data?.versions.find((v) => v.id === version);
  const avail = (data?.available[version] || {}) as Record<string, number[]>;

  const sections = [
    { key: 'old' as const, title: '旧约全书', subtitle: '39 卷 · 从创世到玛拉基' },
    { key: 'new' as const, title: '新约全书', subtitle: '27 卷 · 从福音到启示' },
  ].map((sec) => {
    const map = new Map<string, GroupedBook[]>();
    for (const b of data?.books ?? []) {
      if (b.testament !== sec.key) continue;
      const list = (avail[b.id] || []).slice().sort((a, b2) => a - b2);
      const gb: GroupedBook = { ...b, chaptersAvailable: list };
      if (!map.has(b.category)) map.set(b.category, []);
      map.get(b.category)!.push(gb);
    }
    return { ...sec, groups: Array.from(map, ([category, books]) => ({ category, books })) };
  });

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-72 h-72 bg-gold-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-16 md:pb-14">
          <Link href="/bible" className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回圣经首页
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2">
            {versionMeta ? versionMeta.fullName : version}
          </h1>
          <p className="text-white/70 font-serif italic">
            {versionMeta ? `${versionMeta.name}（${versionMeta.language}）` : '选择书卷与章节开始阅读'}
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {loading ? (
          <div className="space-y-12 animate-pulse">
            {[0, 1].map((s) => (
              <div key={s}>
                <div className="h-8 w-40 bg-ink-100 rounded-lg mb-6" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-28 bg-ink-100 rounded-2xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          sections.map((sec) => (
            <section key={sec.key} className="mb-12">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ${
                  sec.key === 'old' ? 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-primary-500/30' : 'bg-gradient-to-br from-gold-500 to-gold-600 shadow-gold-500/30'
                }`}>
                  <span className="text-white font-bold">{sec.key === 'old' ? '旧' : '新'}</span>
                </div>
                <div>
                  <h2 className="font-display text-xl md:text-3xl font-bold text-ink-900">{sec.title}</h2>
                  <p className="text-ink-500 text-sm">{sec.subtitle}</p>
                </div>
              </div>

              {sec.groups.map((g) => (
                <div key={g.category} className="mb-8">
                  <h3 className="text-sm font-semibold text-primary-700 mb-3">{g.category}</h3>
                  <div className="space-y-4">
                    {g.books.map((b) => (
                      <div key={b.id} className="bg-white rounded-2xl p-5 shadow-soft border border-ink-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-display font-semibold text-ink-900">{b.name}</h4>
                            <p className="text-xs text-ink-400 mt-0.5">
                              {b.chapters} 章 · 已收录 {b.chaptersAvailable.length} 章
                            </p>
                          </div>
                          {b.chaptersAvailable.length > 0 ? (
                            <Link
                              href={`/bible/${version}/${b.id}/${b.chaptersAvailable[0]}`}
                              className="btn-primary btn-sm px-4 text-sm"
                            >
                              开始阅读
                            </Link>
                          ) : (
                            <span className="text-xs px-3 py-2 rounded-full bg-ink-100 text-ink-400">暂无数据</span>
                          )}
                        </div>

                        {b.chaptersAvailable.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {b.chaptersAvailable.map((ch) => (
                              <Link
                                key={ch}
                                href={`/bible/${version}/${b.id}/${ch}`}
                                className="w-9 h-9 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-medium flex items-center justify-center transition-colors"
                              >
                                {ch}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-ink-400">本译本暂未收录该书卷的经文。</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
