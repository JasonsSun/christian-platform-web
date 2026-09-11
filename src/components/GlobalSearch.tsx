'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import type { ContentItem, SongItem, ActivityItem, Verse } from '@/lib/types';

/* ---------------- 搜索结果类型 ---------------- */

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  city?: string;
  church?: string;
}

interface SearchResponse {
  keyword: string;
  contents: ContentItem[];
  songs: SongItem[];
  activities: ActivityItem[];
  verses: Verse[];
  users: SearchUser[];
}

/* ---------------- 常量 ---------------- */

const RECENT_KEY = 'sj_recent_searches';
const RECENT_MAX = 8;
const HOT_WORDS = ['耶稣', '诗篇 23', '约翰福音', '复活', '祷告', '十字架', '爱的真谛', '奇异恩典'];

const CATEGORIES: { key: keyof SearchResponse; label: string; icon: string }[] = [
  { key: 'verses', label: '圣经经文', icon: '📖' },
  { key: 'songs', label: '诗歌', icon: '🎵' },
  { key: 'contents', label: '内容', icon: '📝' },
  { key: 'activities', label: '活动', icon: '📅' },
  { key: 'users', label: '用户', icon: '👤' },
];

/* ---------------- 工具 ---------------- */

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

function highlight(text: string, keyword: string) {
  if (!keyword) return text;
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-gold-200 text-gold-900 rounded px-0.5">{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  );
}

/* ---------------- 组件 ---------------- */

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 最近搜索
  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  // 点击外部关闭
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const path = debounced ? `/search?q=${encodeURIComponent(debounced)}` : null;
  const { data: results, loading } = useApi<SearchResponse>(path, [debounced]);

  // 各类跳转链接
  const verseHref = (v: Verse) => `/bible/${v.version}/${v.bookId}/${v.chapter}#v${v.verse}`;
  const songHref = (s: SongItem) => `/songs/${s.id}`;
  const contentHref = (c: ContentItem) => `/contents/${c.id}`;
  const activityHref = (a: ActivityItem) => `/activities/${a.id}`;
  const userHref = (u: SearchUser) => `/users/${u.id}`;

  // 键盘可导航项扁平化
  const navItems = useMemo(() => {
    if (!debounced) {
      // 空状态：最近搜索 + 热门搜索
      const recents = recent.map((w) => ({
        key: `recent:${w}`,
        label: w,
        sub: '最近搜索',
        icon: '🕒',
        action: () => {
          setQuery(w);
          inputRef.current?.focus();
        },
      }));
      const hots = HOT_WORDS.map((w) => ({
        key: `hot:${w}`,
        label: w,
        sub: '热门',
        icon: '🔥',
        action: () => {
          setQuery(w);
          inputRef.current?.focus();
        },
      }));
      return [...recents, ...hots];
    }
    if (!results) return [];
    const items: { key: string; label: string; sub?: string; icon?: string; href?: string; action?: () => void }[] = [];
    CATEGORIES.forEach((cat) => {
      const list = (results[cat.key] || []) as any[];
      list.slice(0, 3).forEach((item: any, i: number) => {
        let label = '';
        let sub = '';
        let href = '';
        if (cat.key === 'verses') {
          const v = item as Verse;
          label = `${v.bookName || v.bookId} ${v.chapter}:${v.verse}`;
          sub = v.text.slice(0, 40);
          href = verseHref(v);
        } else if (cat.key === 'songs') {
          const s = item as SongItem;
          label = s.title;
          sub = s.author || '';
          href = songHref(s);
        } else if (cat.key === 'contents') {
          const c = item as ContentItem;
          label = c.title;
          sub = c.excerpt || c.body.slice(0, 40);
          href = contentHref(c);
        } else if (cat.key === 'activities') {
          const a = item as ActivityItem;
          label = a.title;
          sub = a.city || a.location || '';
          href = activityHref(a);
        } else if (cat.key === 'users') {
          const u = item as SearchUser;
          label = u.displayName || u.username;
          sub = u.church || u.city || '';
          href = userHref(u);
        }
        items.push({ key: `${cat.key}-${i}`, label, sub, icon: cat.icon, href });
      });
    });
    return items;
  }, [debounced, results, recent]);

  // 结果变化时重置选中
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, results, recent]);

  function commitSearch(text: string) {
    const t = text.trim();
    if (!t) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x !== t)].slice(0, RECENT_MAX);
      saveRecent(next);
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = navItems[activeIndex];
      if (active) {
        if ('href' in active && active.href) {
          commitSearch(debounced || active.label);
          setOpen(false);
          router.push(active.href);
        } else if (active.action) {
          active.action();
        }
      } else if (debounced) {
        commitSearch(debounced);
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(debounced)}`);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const totalCount = results
    ? CATEGORIES.reduce((sum, c) => sum + ((results[c.key] as any[])?.length || 0), 0)
    : 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="搜索圣经、诗歌、内容、活动、用户"
          className="w-full pl-10 pr-20 py-2.5 rounded-full border border-ink-200 bg-white/80 backdrop-blur-sm text-sm text-ink-900 placeholder:text-ink-400 transition-all focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 focus:bg-white"
          aria-label="全局搜索"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setDebounced('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 text-sm"
            aria-label="清除"
          >
            ✕
          </button>
        ) : null}
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open ? (
        <div className="absolute z-50 left-0 right-0 mt-2 glass rounded-2xl shadow-card border border-white/60 overflow-hidden animate-fade-in">
          {/* 有搜索词 + 结果 */}
          {debounced ? (
            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center text-sm text-ink-400">搜索中…</div>
              ) : !results || totalCount === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="text-3xl mb-2">🔍</div>
                  <div className="text-sm text-ink-500">没有找到与「{debounced}」相关的内容</div>
                  <button
                    onClick={() => router.push(`/search?q=${encodeURIComponent(debounced)}`)}
                    className="mt-3 text-xs text-primary-600 hover:text-primary-700"
                  >
                    尝试全站搜索 →
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  {CATEGORIES.map((cat) => {
                    const list = (results[cat.key] || []) as any[];
                    if (list.length === 0) return null;
                    return (
                      <div key={cat.key} className="px-2 py-1.5">
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">
                            {cat.icon} {cat.label}
                          </span>
                          <Link
                            href={`/search?q=${encodeURIComponent(debounced)}`}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            更多
                          </Link>
                        </div>
                        {list.slice(0, 3).map((item: any, i: number) => {
                          const itemKey = `${cat.key}-${i}`;
                          const idx = navItems.findIndex((n) => n.key === itemKey);
                          const active = idx === activeIndex;
                          let label = '';
                          let sub = '';
                          let href = '';
                          if (cat.key === 'verses') {
                            const v = item as Verse;
                            label = `${v.bookName || v.bookId} ${v.chapter}:${v.verse}`;
                            sub = v.text;
                            href = verseHref(v);
                          } else if (cat.key === 'songs') {
                            const s = item as SongItem;
                            label = s.title;
                            sub = s.author || '';
                            href = songHref(s);
                          } else if (cat.key === 'contents') {
                            const c = item as ContentItem;
                            label = c.title;
                            sub = c.excerpt || c.body;
                            href = contentHref(c);
                          } else if (cat.key === 'activities') {
                            const a = item as ActivityItem;
                            label = a.title;
                            sub = a.city || a.location || '';
                            href = activityHref(a);
                          } else if (cat.key === 'users') {
                            const u = item as SearchUser;
                            label = u.displayName || u.username;
                            sub = u.church || u.city || '';
                            href = userHref(u);
                          }
                          return (
                            <Link
                              key={itemKey}
                              href={href}
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => {
                                commitSearch(debounced);
                                setOpen(false);
                              }}
                              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                                active ? 'bg-primary-50' : 'hover:bg-ink-50'
                              }`}
                            >
                              <span className="mt-0.5 text-sm">{cat.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-ink-900 truncate">
                                  {highlight(label, debounced)}
                                </div>
                                {sub ? (
                                  <div className="text-xs text-ink-500 truncate">{sub}</div>
                                ) : null}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* 空状态：最近搜索 + 热门搜索 */
            <div className="p-4">
              {recent.length > 0 ? (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">🕒 最近搜索</span>
                    <button
                      onClick={() => {
                        setRecent([]);
                        saveRecent([]);
                      }}
                      className="text-xs text-ink-400 hover:text-rose-500"
                    >
                      清空
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((w) => (
                      <button
                        key={w}
                        onClick={() => {
                          setQuery(w);
                          inputRef.current?.focus();
                        }}
                        className="px-3 py-1 rounded-full bg-ink-100 hover:bg-primary-100 hover:text-primary-700 text-sm text-ink-600 transition-colors"
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">🔥 热门搜索</div>
                <div className="flex flex-wrap gap-2">
                  {HOT_WORDS.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        setQuery(w);
                        inputRef.current?.focus();
                      }}
                      className="px-3 py-1 rounded-full bg-gold-50 hover:bg-gold-100 text-sm text-gold-700 transition-colors"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default GlobalSearch;
