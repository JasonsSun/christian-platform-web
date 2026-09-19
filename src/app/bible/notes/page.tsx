'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiGet, apiDelete } from '@/lib/api';
import { downloadText, safeFilename } from '@/lib/download';

type BmItem = {
  id: string;
  version: string;
  bookId: string;
  chapter: number;
  verse: number;
  note: string;
  createdAt: string;
  bookName: string;
};

type Group = { key: string; bookName: string; bookId: string; chapter: number; items: BmItem[] };

export default function BibleNotesPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<BmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await apiGet<{ items: BmItem[] }>('/bible/bookmarks');
      setItems(j.items || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading, load]);

  const del = async (id: string) => {
    setDeletingId(id);
    try {
      await apiDelete<{ deleted: boolean }>(`/bible/bookmarks?id=${encodeURIComponent(id)}`);
      setItems((it) => it.filter((x) => x.id !== id));
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  };

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const key = `${it.bookId}/${it.chapter}`;
      if (!map.has(key)) {
        map.set(key, { key, bookName: it.bookName, bookId: it.bookId, chapter: it.chapter, items: [] });
      }
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.bookId === b.bookId ? a.chapter - b.chapter : a.bookName.localeCompare(b.bookName, 'zh')
    );
  }, [items]);

  const noteCount = items.filter((i) => i.note && i.note.trim()).length;

  /** 导出为 Markdown：把高亮与笔记从平台「取回」到自己电脑，便于长期留存或迁移 */
  const exportMarkdown = () => {
    if (!items.length) return;
    const lines: string[] = [];
    lines.push('# 我的灵修笔记');
    lines.push('');
    lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}`);
    lines.push(`> 共 ${items.length} 处高亮，其中 ${noteCount} 条笔记`);
    lines.push('');
    for (const g of groups) {
      lines.push(`## ${g.bookName} 第 ${g.chapter} 章`);
      lines.push('');
      for (const it of g.items.slice().sort((a, b) => a.verse - b.verse)) {
        const label = it.verse > 0 ? `第 ${it.verse} 节` : '全章';
        const text = it.note && it.note.trim() ? it.note.trim() : '（仅高亮，无笔记）';
        lines.push(`- **${label}**：${text}`);
      }
      lines.push('');
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`${safeFilename('灵修笔记')}-${date}.md`, lines.join('\n'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-gold-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900">我的灵修笔记</h1>
            <p className="text-sm text-ink-500 mt-1">
              共 {items.length} 处高亮 · {noteCount} 条笔记（跨设备同步）
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {user && items.length > 0 && (
              <button
                onClick={exportMarkdown}
                title="把全部高亮与笔记导出为 Markdown 文件"
                className="px-3 py-2 rounded-xl text-sm font-medium text-ink-600 bg-white border border-ink-200 hover:border-primary-300 hover:text-primary-700 transition-colors"
              >
                导出 Markdown
              </button>
            )}
            <Link
              href="/bible"
              className="px-3 py-2 rounded-xl text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
            >
              返回圣经
            </Link>
          </div>
        </div>

        {/* 灵修日记入口：笔记是读经时的领受，日记是更完整的默想，彼此呼应 */}
        <Link
          href="/devotions"
          className="group mb-6 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-700 px-4 py-3 text-white shadow-glow hover:opacity-95 transition-opacity"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg flex-shrink-0">📖</span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold">灵修日记</p>
              {/* 半透明白落在 primary-500 那端实测只有 4.08，11px 小字过不了 AA */}
              <p className="text-[11px] text-white truncate">把读经的领受写下来，回看神一路的带领</p>
            </div>
          </div>
          <span className="flex-shrink-0 text-sm font-semibold text-white/90 group-hover:translate-x-0.5 transition-transform">›</span>
        </Link>

        {!user && !authLoading ? (
          <div className="glass rounded-2xl p-10 text-center shadow-card border border-white/40">
            <p className="text-ink-500">登录后查看你的高亮与笔记</p>
            <Link href="/login" className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-700 shadow-glow">
              去登录
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass rounded-2xl p-5 h-20 animate-pulse border border-white/40" />
            ))}
          </div>
        ) : error ? (
          <p className="text-rose-600 text-sm">{error}</p>
        ) : items.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center shadow-card border border-white/40">
            <p className="text-ink-500">还没有高亮或笔记。</p>
            <p className="text-ink-400 text-sm mt-1">在读经时，把鼠标移到节号旁的 ＋ 即可标记高亮、写下领受。</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key} className="glass rounded-2xl p-5 shadow-card border border-white/40">
                <div className="flex items-center justify-between mb-3">
                  <Link
                    href={`/bible/cuv/${g.bookId}/${g.chapter}`}
                    className="font-display text-lg font-bold text-ink-900 hover:text-primary-700"
                  >
                    {g.bookName} 第 {g.chapter} 章
                  </Link>
                  <span className="text-xs text-ink-400">{g.items.length} 处</span>
                </div>
                <div className="space-y-2">
                  {g.items
                    .slice()
                    .sort((a, b) => a.verse - b.verse)
                    .map((it) => (
                      <div key={it.id} className="flex items-start gap-3 rounded-xl bg-ui-surface hover:bg-white px-3 py-2 border border-ink-100 transition-all">
                        <Link
                          href={`/bible/cuv/${g.bookId}/${g.chapter}`}
                          className="flex-shrink-0 font-semibold text-primary-600 text-sm pt-0.5"
                          onClick={() => sessionStorage.setItem('jumpVerse', String(it.verse))}
                        >
                          {it.verse > 0 ? `${it.verse}节` : '全章'}
                        </Link>
                        <p className="flex-1 text-sm text-ink-600 whitespace-pre-wrap break-words min-w-0">
                          {it.note && it.note.trim() ? (
                            it.note
                          ) : (
                            <span className="text-ink-400">（仅高亮，无笔记）</span>
                          )}
                        </p>
                        <button
                          onClick={() => del(it.id)}
                          disabled={deletingId === it.id}
                          title="删除这条高亮 / 笔记"
                          className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg text-ink-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                        >
                          {deletingId === it.id ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 109 9" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
