'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo, formatDate } from '@/lib/format';
import type { BibleMeta, BibleBook } from '@/lib/types';

type GroupedBook = BibleBook & { readable: boolean };
type CatGroup = { category: string; books: GroupedBook[] };
type SearchItem = { version: string; bookId: string; bookName: string; chapter: number; verse: number; text: string };

type PlanToday = { version: string; bookId: string; chapter: number; bookName?: string };
type PlanResp = {
  today: PlanToday[];
  streak: number;
  totalChapters: number;
  librarySize: number;
};
type HistoryItem = { version: string; bookId: string; chapter: number; bookName?: string; readDate?: string; readAt?: string };
type HistoryResp = { items: HistoryItem[] };
type BookmarkItem = { id: string; version: string; bookId: string; chapter: number; verse: number; note?: string; bookName?: string };
type BookmarkResp = { items: BookmarkItem[] };

type DailyVerse = { bookId: string; bookName: string; chapter: number; verse: number; text: string } | null;

export default function BibleHome() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<BibleMeta>('/bible');
  const { data: homeData } = useApi<{ verse: DailyVerse }>('/home');
  const [version, setVersion] = useState('');
  const [input, setInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [bookFilter, setBookFilter] = useState('');

  const loggedIn = !!user;
  const planPath = loggedIn ? '/bible/plan' : null;
  const historyPath = loggedIn ? '/bible/history' : null;
  const bmPath = loggedIn ? '/bible/bookmarks' : null;

  const { data: plan, loading: planLoading, error: planError } = useApi<PlanResp>(planPath, [loggedIn]);
  const { data: history, loading: hLoading, error: hError } = useApi<HistoryResp>(historyPath, [loggedIn]);
  const { data: bm, loading: bmLoading, error: bmError } = useApi<BookmarkResp>(bmPath, [loggedIn]);

  const versions = data?.versions ?? [];
  const activeVersion = version || versions[0]?.id || '';
  const activeMeta = versions.find((v) => v.id === activeVersion);

  const sections = useMemo(() => {
    const avail = (data?.available[activeVersion] || {}) as Record<string, number[]>;
    const kw = bookFilter.trim().toLowerCase();
    const out: { key: 'old' | 'new'; title: string; subtitle: string; groups: CatGroup[] }[] = [
      { key: 'old', title: '旧约全书', subtitle: '39 卷 · 从创世到玛拉基', groups: [] },
      { key: 'new', title: '新约全书', subtitle: '27 卷 · 从福音到启示', groups: [] },
    ];
    for (const sec of out) {
      const map = new Map<string, GroupedBook[]>();
      for (const b of data?.books ?? []) {
        if (b.testament !== sec.key) continue;
        if (kw && !b.name.toLowerCase().includes(kw) && !b.abbr.toLowerCase().includes(kw) && !b.id.toLowerCase().includes(kw)) continue;
        const gb: GroupedBook = { ...b, readable: (avail[b.id]?.length ?? 0) > 0 };
        if (!map.has(b.category)) map.set(b.category, []);
        map.get(b.category)!.push(gb);
      }
      sec.groups = Array.from(map, ([category, books]) => ({ category, books }));
    }
    return out;
  }, [data, activeVersion, bookFilter]);

  // 继续阅读：优先用服务端历史，未登录时用本地记录兜底
  const [localLast, setLocalLast] = useState<HistoryItem | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('bible:last');
      if (raw) setLocalLast(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  const lastRead: HistoryItem | null = history?.items?.[0] || localLast;

  const searchPath = searchQ.trim()
    ? '/bible/search' + qs({ q: searchQ.trim(), version: activeVersion })
    : null;
  const { data: sData, loading: sLoading, error: sError } = useApi<{ total: number; items: SearchItem[] }>(
    searchPath,
    [searchQ, activeVersion]
  );

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-72 h-72 bg-gold-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 md:pt-16 md:pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
            <svg className="w-4 h-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-white/80 text-sm font-medium">
              {versions.length} 种译本 · {data?.books.length ?? 66} 卷书
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-4 md:mb-6">在线圣经</h1>
          <p className="text-base sm:text-xl text-white/70 max-w-2xl mx-auto mb-6 md:mb-8 font-serif italic">
            "你的话是我脚前的灯，是我路上的光。" —— 诗篇 119:105
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQ(input);
            }}
            className="max-w-xl mx-auto relative"
          >
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜索经文关键词，如「爱」「恩典」「平安」..."
              className="w-full pl-14 pr-12 py-4 rounded-2xl bg-white/95 backdrop-blur-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-primary-500/30 shadow-xl text-base"
            />
            {searchQ && (
              <button
                type="button"
                onClick={() => {
                  setSearchQ('');
                  setInput('');
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center text-ink-500 transition-colors"
                aria-label="清除搜索"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </form>

          {lastRead && (
            <div className="mt-5 flex justify-center">
              <Link
                href={`/bible/${lastRead.version || 'cuv'}/${lastRead.bookId}/${lastRead.chapter}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
                继续阅读 {lastRead.bookName || lastRead.bookId} 第 {lastRead.chapter} 章
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 每日经文卡片 */}
        <section className="mb-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gold-500 via-gold-400 to-gold-600 shadow-card-hover">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-10 w-72 h-72 bg-primary-400/15 rounded-full blur-3xl" />
            <div className="relative px-6 py-7 md:px-10 md:py-9 flex flex-col md:flex-row md:items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 rounded-full bg-white/25 text-white text-xs font-semibold backdrop-blur-sm">每日经文</span>
                  <span className="text-white/80 text-xs">今日灵修 · 自动更新</span>
                </div>
                {homeData?.verse ? (
                  <>
                    <p className="font-serif text-lg md:text-xl text-white leading-relaxed mb-2">“{homeData.verse.text}”</p>
                    <Link
                      href={`/bible/cuv/${homeData.verse.bookId}/${homeData.verse.chapter}`}
                      className="text-sm text-white/90 font-medium hover:text-white hover:underline inline-flex items-center gap-1"
                    >
                      —— {homeData.verse.bookName} {homeData.verse.chapter}:{homeData.verse.verse}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </Link>
                  </>
                ) : (
                  <p className="text-white/80">今日经文加载中…</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 个人读经概览：今日读经 / 最近读经 / 我的书签 */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {/* 今日读经 */}
          <div className="glass rounded-2xl p-5 shadow-card border border-white/40">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center shadow-gold-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </span>
              <h3 className="font-display text-lg font-bold text-ink-900">今日读经</h3>
            </div>

            {!loggedIn ? (
              <p className="text-ink-500 text-sm">登录后开启读经计划</p>
            ) : planLoading ? (
              <PlanSkeleton />
            ) : planError ? (
              <p className="text-rose-600 text-sm">加载失败：{planError}</p>
            ) : plan && plan.today.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <Stat value={plan.streak} label="连续打卡" />
                  <Stat value={plan.totalChapters} label="已读章数" />
                  <Stat value={plan.librarySize} label="文库规模" />
                </div>
                <p className="text-xs text-ink-400 mb-2">今日计划（{plan.today.length} 段）</p>
                <div className="space-y-2">
                  {plan.today.map((t, i) => (
                    <Link
                      key={i}
                      href={`/bible/${t.version}/${t.bookId}/${t.chapter}`}
                      className="block bg-white/70 hover:bg-white rounded-xl px-3 py-2 border border-ink-100 hover:border-primary-200 transition-all text-sm font-medium text-primary-700"
                    >
                      {t.bookName} 第 {t.chapter} 章
                      <span className="text-ink-400 font-normal ml-1">›</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-ink-500 text-sm">今天还没有安排读经，去书卷里开始吧～</p>
            )}
          </div>

          {/* 最近读经 */}
          <div className="glass rounded-2xl p-5 shadow-card border border-white/40">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-primary-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <h3 className="font-display text-lg font-bold text-ink-900">最近读经</h3>
            </div>

            {!loggedIn ? (
              <p className="text-ink-500 text-sm">登录后查看阅读记录</p>
            ) : hLoading ? (
              <ListSkeleton />
            ) : hError ? (
              <p className="text-rose-600 text-sm">加载失败：{hError}</p>
            ) : history && history.items.length > 0 ? (
              <div className="space-y-2">
                {history.items.slice(0, 6).map((it, i) => (
                  <Link
                    key={i}
                    href={`/bible/${it.version}/${it.bookId}/${it.chapter}`}
                    className="flex items-center justify-between gap-2 bg-white/70 hover:bg-white rounded-xl px-3 py-2 border border-ink-100 hover:border-primary-200 transition-all"
                  >
                    <span className="text-sm font-medium text-ink-800 truncate">
                      {it.bookName} 第 {it.chapter} 章
                    </span>
                    <span className="text-[11px] text-ink-400 flex-shrink-0">
                      {formatDate(it.readDate) || timeAgo(it.readAt)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-ink-500 text-sm">还没有阅读记录</p>
            )}
          </div>

          {/* 我的书签 */}
          <div className="glass rounded-2xl p-5 shadow-card border border-white/40">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center shadow-gold-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </span>
              <h3 className="font-display text-lg font-bold text-ink-900">我的书签</h3>
            </div>

            {!loggedIn ? (
              <p className="text-ink-500 text-sm">登录后查看收藏书签</p>
            ) : bmLoading ? (
              <ListSkeleton />
            ) : bmError ? (
              <p className="text-rose-600 text-sm">加载失败：{bmError}</p>
            ) : bm && bm.items.length > 0 ? (
              <div className="space-y-2">
                {bm.items.slice(0, 6).map((it) => (
                  <Link
                    key={it.id}
                    href={`/bible/${it.version}/${it.bookId}/${it.chapter}`}
                    className="block bg-white/70 hover:bg-white rounded-xl px-3 py-2 border border-ink-100 hover:border-primary-200 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800 truncate">
                        {it.bookName} 第 {it.chapter} 章
                        {it.verse > 0 && <span className="text-primary-600">:{it.verse}</span>}
                      </span>
                      <span className="text-[11px] text-ink-400 flex-shrink-0">
                        {it.verse > 0 ? '节' : '全章'}
                      </span>
                    </div>
                    {it.note && <p className="text-xs text-ink-500 mt-0.5 truncate">{it.note}</p>}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-ink-500 text-sm">还没有书签</p>
            )}
          </div>
        </section>

        {/* 译本切换 */}
        <div className="flex flex-wrap gap-2 mb-8">
          {versions.map((v) => {
            const active = v.id === activeVersion;
            return (
              <button
                key={v.id}
                onClick={() => {
                  setVersion(v.id);
                  setSearchQ('');
                }}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                  active
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30'
                    : 'bg-white text-ink-600 hover:bg-ink-50 border border-ink-200 hover:border-primary-300'
                }`}
                title={v.fullName}
              >
                {v.name}
                <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{v.language}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-rose-600 text-sm mb-6">加载失败：{error}</p>}

        {/* 书卷快速过滤 */}
        {!searchQ.trim() && (
          <div className="relative max-w-md mb-8">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              placeholder="快速定位书卷，如「诗篇」「太」「john」..."
              className="w-full pl-12 pr-10 py-3 rounded-2xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-primary-500/20 focus:border-primary-400 shadow-soft transition-all"
            />
            {bookFilter && (
              <button
                type="button"
                onClick={() => setBookFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center text-ink-500 transition-colors"
                aria-label="清除书卷筛选"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 搜索结果（内联） */}
        {searchQ.trim() ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl md:text-2xl font-bold text-ink-900">
                「{searchQ}」的检索结果
                {activeMeta && <span className="text-sm font-normal text-ink-400 ml-2">· {activeMeta.name}</span>}
              </h2>
              <button onClick={() => { setSearchQ(''); setInput(''); }} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                返回书卷
              </button>
            </div>

            {sError && <p className="text-rose-600 text-sm mb-4">搜索失败：{sError}</p>}
            {sLoading && <VerseSkeleton />}
            {!sLoading && sData && sData.items.length === 0 && (
              <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-ink-500">当前译本没有找到包含「{searchQ}」的经文</p>
              </div>
            )}
            {!sLoading && sData && sData.items.length > 0 && (
              <>
                <p className="text-sm text-ink-500 mb-4">共 {sData.total} 处匹配</p>
                <div className="space-y-3">
                  {sData.items.map((it, i) => (
                    <Link
                      key={i}
                      href={`/bible/${it.version}/${it.bookId}/${it.chapter}`}
                      className="block bg-white rounded-2xl p-5 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-primary-700">{it.bookName} {it.chapter}:{it.verse}</span>
                      </div>
                      <p className="text-ink-700 font-serif leading-relaxed line-clamp-3">{it.text}</p>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : loading ? (
          <BookSkeleton />
        ) : sections.every((s) => s.groups.length === 0) ? (
          <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
            <div className="text-5xl mb-4">📖</div>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">没有找到匹配的书卷</h3>
            <p className="text-ink-500">试试更换关键词，或<button onClick={() => setBookFilter('')} className="text-primary-600 hover:underline font-medium">清除筛选</button></p>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {g.books.map((b) => (
                      <Link
                        key={b.id}
                        href={`/bible/${activeVersion}/${b.id}`}
                        className="group bg-white rounded-2xl p-4 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 border border-ink-100 hover:border-primary-200"
                      >
                        <div className="font-display font-semibold text-ink-900 group-hover:text-primary-600 transition-colors">
                          {b.name}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-ink-400">{b.chapters} 章</span>
                          {b.readable ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">可读</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-400">暂无</span>
                          )}
                        </div>
                      </Link>
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white/60 rounded-xl py-2 border border-ink-100">
      <div className="font-display text-xl font-bold text-primary-700">{value}</div>
      <div className="text-[11px] text-ink-400 mt-0.5">{label}</div>
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 bg-ink-100 rounded-xl" />
        <div className="h-12 bg-ink-100 rounded-xl" />
        <div className="h-12 bg-ink-100 rounded-xl" />
      </div>
      <div className="h-9 bg-ink-100 rounded-xl" />
      <div className="h-9 bg-ink-100 rounded-xl" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-9 bg-ink-100 rounded-xl" />
      ))}
    </div>
  );
}

function BookSkeleton() {
  return (
    <div className="space-y-12 animate-pulse">
      {[0, 1].map((s) => (
        <div key={s}>
          <div className="h-8 w-40 bg-ink-100 rounded-lg mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 bg-ink-100 rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VerseSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 bg-ink-100 rounded-2xl" />
      ))}
    </div>
  );
}
