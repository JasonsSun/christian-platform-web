'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchBibleBooks, fetchBibleChapter } from '@/lib/bible-api';
import { BOOKS, VERSIONS, bookById } from '@/server/bible';
import Portal from '@/components/Portal';
import { useAuth } from '@/lib/auth';

type VerseMark = { id: string; note: string };
type BmMap = Record<number, VerseMark>;

async function bmGet(version: string, bookId: string, chapter: number): Promise<BmMap> {
  const r = await fetch(`/api/v1/bible/bookmarks?version=${encodeURIComponent(version)}&book=${encodeURIComponent(bookId)}&chapter=${chapter}`, { cache: 'no-store' });
  if (!r.ok) return {};
  const j = await r.json();
  const map: BmMap = {};
  for (const it of (j.items || []) as any[]) {
    if (it.verse > 0) map[it.verse] = { id: it.id, note: it.note || '' };
  }
  return map;
}

interface BibleReaderProps {
  version: string;
  book: string;
  chapter: string;
}

type Testament = 'old' | 'new';

// 圣经静态数据：书卷按约分组 + 版本列表（基于静态导入，供主组件及侧栏子组件共用）
const bibleData = {
  books: {
    old: BOOKS.filter((b) => b.testament === 'old'),
    new: BOOKS.filter((b) => b.testament === 'new'),
  },
  versions: VERSIONS,
};

export function BibleReader({ version, book, chapter }: BibleReaderProps) {
  const router = useRouter();

  // 主题 & 字体
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);

  // 侧边栏 / 移动端底部 sheet
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ===== 经文笔记 / 划线高亮 =====
  const { user } = useAuth();
  const loggedIn = !!user;
  const [bmMap, setBmMap] = useState<BmMap>({});
  const [bmLoading, setBmLoading] = useState(false);
  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [bmBusy, setBmBusy] = useState(false);
  const [chapterNotesOpen, setChapterNotesOpen] = useState(false);

  // 加载本章书签 / 笔记
  useEffect(() => {
    let alive = true;
    if (!loggedIn) { setBmMap({}); return; }
    setBmLoading(true);
    bmGet(version, book, parseInt(chapter, 10))
      .then((m) => { if (alive) setBmMap(m); })
      .catch(() => {})
      .finally(() => { if (alive) setBmLoading(false); });
    return () => { alive = false; };
  }, [loggedIn, version, book, chapter]);

  const openNote = async (verse: number) => {
    if (!loggedIn) { setToast('登录后可使用经文笔记'); return; }
    setNoteDraft(bmMap[verse]?.note || '');
    if (!bmMap[verse]) {
      try {
        const r = await fetch('/api/v1/bible/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version, bookId: book, chapter: parseInt(chapter, 10), verse }),
        });
        const j = await r.json();
        if (r.ok && j.id) setBmMap((m) => ({ ...m, [verse]: { id: j.id, note: '' } }));
      } catch { /* ignore */ }
    }
    setNoteVerse(verse);
  };

  const saveNote = async () => {
    if (noteVerse == null) return;
    const cur = bmMap[noteVerse];
    if (!cur) return;
    setBmBusy(true);
    try {
      const r = await fetch('/api/v1/bible/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, bookId: book, chapter: parseInt(chapter, 10), verse: noteVerse, note: noteDraft }),
      });
      if (r.ok) setBmMap((m) => ({ ...m, [noteVerse]: { id: cur.id, note: noteDraft } }));
      setNoteVerse(null);
      setToast(noteDraft.trim() ? '笔记已保存' : '已更新高亮');
    } catch {
      setToast('保存失败，请重试');
    } finally {
      setBmBusy(false);
    }
  };

  const removeMark = async (verse: number) => {
    const cur = bmMap[verse];
    if (!cur) return;
    setBmBusy(true);
    try {
      await fetch(`/api/v1/bible/bookmarks?id=${cur.id}`, { method: 'DELETE' });
      setBmMap((m) => { const n = { ...m }; delete n[verse]; return n; });
      if (noteVerse === verse) setNoteVerse(null);
    } catch { /* ignore */ }
    finally { setBmBusy(false); }
  };

  const markedVerses = Object.keys(bmMap).map(Number).sort((a, b) => a - b);

  // 圣经数据
  const [books, setBooks] = useState<typeof BOOKS>(BOOKS);
  const [versions] = useState(VERSIONS);
  const [verses, setVerses] = useState<Array<{ verse: number; text: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ===== 多版本对照 =====
  const [compareVersion, setCompareVersion] = useState('');
  const [compareVerses, setCompareVerses] = useState<Array<{ verse: number; text: string }>>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  // ===== 离线状态 =====
  const [offline, setOffline] = useState(false);

  // 当前卷书信息
  const allBooks = useMemo(() => books, [books]);
  const currentBook = useMemo(
    () => allBooks.find((b) => b.id === book),
    [allBooks, book]
  );
  const currentChapterNum = useMemo(() => parseInt(chapter, 10), [chapter]);

  // 当前版本信息
  const currentVersion = useMemo(
    () => versions.find((v) => v.id === version) ?? versions[0],
    [versions, version]
  );

  // 对照译本按节索引
  const compareMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const v of compareVerses) m[v.verse] = v.text;
    return m;
  }, [compareVerses]);
  const compareVersionName = useMemo(
    () => versions.find((v) => v.id === compareVersion)?.name,
    [versions, compareVersion]
  );

  // 加载章节数据 + 读经进度记忆
  useEffect(() => {
    const loadChapter = async () => {
      try {
        setLoading(true);
        const data = await fetchBibleChapter(version, book, parseInt(chapter, 10));
        setVerses(data.verses);
        // 记录读经进度(书/章) — 复用首页 localLast 的 bible:last 键,匿名用户也能续读
        try {
          const raw = localStorage.getItem('bible:last');
          const prev = raw ? JSON.parse(raw) : {};
          localStorage.setItem('bible:last', JSON.stringify({ ...prev, version, bookId: book, chapter: parseInt(chapter, 10) }));
        } catch { /* ignore */ }
        const jv = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jumpVerse') : null;
        if (jv) {
          sessionStorage.removeItem('jumpVerse');
          setTimeout(() => {
            const el = document.getElementById(`verse-${jv}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 350);
        } else {
          // 无跳转指令时,恢复到上次读到的节
          try {
            const raw = localStorage.getItem('bible:last');
            const lr = raw ? JSON.parse(raw) : null;
            if (lr && lr.bookId === book && Number(lr.chapter) === parseInt(chapter, 10) && lr.verse) {
              setTimeout(() => {
                const el = document.getElementById(`verse-${lr.verse}`);
                if (el) el.scrollIntoView({ block: 'center' });
              }, 350);
            }
          } catch { /* ignore */ }
        }
      } catch (e) {
        console.error('Failed to load chapter:', e);
        setError('加载失败，请重试');
      } finally {
        setLoading(false);
      }
    };
    loadChapter();
  }, [version, book, chapter]);

  // 对照译本数据
  useEffect(() => {
    let alive = true;
    if (!compareVersion) { setCompareVerses([]); return; }
    setCompareLoading(true);
    fetchBibleChapter(compareVersion, book, parseInt(chapter, 10))
      .then((d) => { if (alive) setCompareVerses(d.verses); })
      .catch(() => { if (alive) setCompareVerses([]); })
      .finally(() => { if (alive) setCompareLoading(false); });
    return () => { alive = false; };
  }, [compareVersion, version, book, chapter]);


  // 主题持久化
  useEffect(() => {
    const saved = localStorage.getItem('bible-dark-mode');
    if (saved) setDarkMode(saved === 'true');
    const savedFont = localStorage.getItem('bible-font-size');
    if (savedFont) setFontSize(parseInt(savedFont, 10));
  }, []);

  useEffect(() => {
    localStorage.setItem('bible-dark-mode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('bible-font-size', String(fontSize));
  }, [fontSize]);

  // ===== 对照译本偏好 + 离线状态 + 读经进度记忆 =====
  useEffect(() => {
    const savedCmp = localStorage.getItem('bible-compare-version');
    if (savedCmp) setCompareVersion(savedCmp);
    const updateOnline = () => setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  // 滚动时记录当前最靠近顶部的节(读经进度记忆)
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const mid = 120;
        let best = 1;
        let bestDist = Infinity;
        for (let n = 1; n <= 200; n++) {
          const el = document.getElementById(`verse-${n}`);
          if (!el) continue;
          const dist = Math.abs(el.getBoundingClientRect().top - mid);
          if (dist < bestDist) { bestDist = dist; best = n; }
        }
        try {
          const raw = localStorage.getItem('bible:last');
          const prev = raw ? JSON.parse(raw) : {};
          localStorage.setItem('bible:last', JSON.stringify({ ...prev, verse: best }));
        } catch { /* ignore */ }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [book, chapter]);

  // Toast 提示
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // 导航辅助
  const navigateTo = (nextBook: string, nextChapter: number | string) => {
    router.push(`/bible/${version}/${nextBook}/${nextChapter}`);
    setMobileSheetOpen(false);
  };

  const goPrevChapter = () => {
    if (!currentBook) return;
    if (currentChapterNum > 1) {
      navigateTo(book, currentChapterNum - 1);
    } else {
      // 跳到上一卷书的最后一章
      const flatBooks = allBooks;
      const idx = flatBooks.findIndex((b) => b.id === book);
      if (idx > 0) {
        const prev = flatBooks[idx - 1];
        navigateTo(prev.id, prev.chapters);
      }
    }
  };

  const goNextChapter = () => {
    if (!currentBook) return;
    if (currentChapterNum < currentBook.chapters) {
      navigateTo(book, currentChapterNum + 1);
    } else {
      const flatBooks = allBooks;
      const idx = flatBooks.findIndex((b) => b.id === book);
      if (idx >= 0 && idx < flatBooks.length - 1) {
        const next = flatBooks[idx + 1];
        navigateTo(next.id, 1);
      }
    }
  };

  const prevDisabled = useMemo(() => {
    if (!currentBook) return true;
    if (currentChapterNum > 1) return false;
    const idx = allBooks.findIndex((b) => b.id === book);
    return idx <= 0;
  }, [currentBook, currentChapterNum, allBooks, book]);

  const nextDisabled = useMemo(() => {
    if (!currentBook) return true;
    if (currentChapterNum < currentBook.chapters) return false;
    const idx = allBooks.findIndex((b) => b.id === book);
    return idx < 0 || idx >= allBooks.length - 1;
  }, [currentBook, currentChapterNum, allBooks, book]);

  const toggleFavorite = () => {
    setFavorited((v) => !v);
    setToast(!favorited ? '已收藏本章' : '已取消收藏');
  };

  const openChapterNotes = () => {
    if (!loggedIn) { setToast('登录后可使用经文笔记'); return; }
    setChapterNotesOpen(true);
  };

  // 暗色主题变体
  const bgClass = darkMode
    ? 'bg-ink-950 text-ink-100'
    : 'bg-ink-50 text-ink-900';
  const cardClass = darkMode
    ? 'bg-ink-900/60 border-white/10'
    : 'bg-white border-ink-100';
  const sidebarBgClass = darkMode
    ? 'bg-ink-900 border-white/10'
    : 'bg-white border-ink-100';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300`}>
      {/* ===== 顶部导航条 ===== */}
      <header
        className={`sticky top-16 md:top-20 z-40 backdrop-blur-xl border-b ${
          darkMode ? 'bg-ink-950/80 border-white/10' : 'bg-white/80 border-ink-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 md:gap-4 h-14 md:h-16">
            {/* 返回首页 */}
            <Link
              href="/bible"
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                darkMode
                  ? 'text-ink-300 hover:text-white hover:bg-white/5'
                  : 'text-ink-600 hover:text-primary-700 hover:bg-primary-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">圣经首页</span>
            </Link>

            {/* 移动端菜单按钮 */}
            <button
              onClick={() => setMobileSheetOpen(true)}
              className={`md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                darkMode
                  ? 'bg-ink-800 text-white hover:bg-ink-700'
                  : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {currentBook?.name ?? '选择书卷'}
            </button>

            {/* 版本选择（桌面端） */}
            <div className="hidden md:flex items-center gap-2">
              <label
                className={`text-xs font-medium ${
                  darkMode ? 'text-ink-400' : 'text-ink-500'
                }`}
              >
                版本
              </label>
              <select
                value={version}
                onChange={(e) => {
                  router.push(`/bible/${e.target.value}/${book}/${chapter}`);
                }}
                className={`appearance-none cursor-pointer pl-3 pr-8 py-2 rounded-xl text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                  darkMode
                    ? 'bg-ink-800 border-white/10 text-white'
                    : 'bg-white border-ink-200 text-ink-900 hover:border-primary-300'
                }`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ba3c4'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '16px',
                }}
              >
                {bibleData.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 对照译本（桌面端） */}
            <div className="hidden md:flex items-center gap-2">
              <label
                className={`text-xs font-medium ${
                  darkMode ? 'text-ink-400' : 'text-ink-500'
                }`}
              >
                对照
              </label>
              <select
                value={compareVersion}
                onChange={(e) => {
                  const v = e.target.value;
                  setCompareVersion(v);
                  try { localStorage.setItem('bible-compare-version', v); } catch { /* ignore */ }
                }}
                className={`appearance-none cursor-pointer pl-3 pr-8 py-2 rounded-xl text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                  darkMode
                    ? 'bg-ink-800 border-white/10 text-white'
                    : 'bg-white border-ink-200 text-ink-900 hover:border-primary-300'
                }`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ba3c4'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '16px',
                }}
              >
                <option value="">不对照</option>
                {bibleData.versions.filter((v) => v.id !== version).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 书名 & 章节（桌面端中间） */}
            <div className="hidden md:flex items-center gap-2 mx-4">
              <span
                className={`font-display text-lg font-bold ${
                  darkMode ? 'text-white' : 'text-ink-900'
                }`}
              >
                {currentBook?.name ?? '--'}
              </span>
              <span
                className={`text-2xl font-light ${
                  darkMode ? 'text-ink-500' : 'text-ink-300'
                }`}
              >
                ·
              </span>
              <span
                className={`font-display text-lg font-bold ${
                  darkMode ? 'text-white' : 'text-ink-900'
                }`}
              >
                {chapter}
              </span>
            </div>

            <div className="flex-1" />

            {/* 上/下一章 */}
            <div className="flex items-center gap-1">
              <button
                onClick={goPrevChapter}
                disabled={prevDisabled}
                className={`p-2 rounded-xl transition-all ${
                  prevDisabled
                    ? darkMode
                      ? 'text-ink-700 cursor-not-allowed'
                      : 'text-ink-200 cursor-not-allowed'
                    : darkMode
                    ? 'text-ink-300 hover:text-white hover:bg-white/5'
                    : 'text-ink-600 hover:text-primary-700 hover:bg-primary-50'
                }`}
                aria-label="上一章"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goNextChapter}
                disabled={nextDisabled}
                className={`p-2 rounded-xl transition-all ${
                  nextDisabled
                    ? darkMode
                      ? 'text-ink-700 cursor-not-allowed'
                      : 'text-ink-200 cursor-not-allowed'
                    : darkMode
                    ? 'text-ink-300 hover:text-white hover:bg-white/5'
                    : 'text-ink-600 hover:text-primary-700 hover:bg-primary-50'
                }`}
                aria-label="下一章"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div
              className={`w-px h-6 hidden md:block ${
                darkMode ? 'bg-white/10' : 'bg-ink-200'
              }`}
            />

            {/* 字体大小 */}
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setFontSize((s) => Math.max(14, s - 2))}
                className={`p-2 rounded-xl text-sm font-semibold transition-colors ${
                  darkMode
                    ? 'text-ink-400 hover:text-white hover:bg-white/5'
                    : 'text-ink-500 hover:text-primary-700 hover:bg-primary-50'
                }`}
                aria-label="减小字体"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize((s) => Math.min(28, s + 2))}
                className={`p-2 rounded-xl text-sm font-semibold transition-colors ${
                  darkMode
                    ? 'text-ink-400 hover:text-white hover:bg-white/5'
                    : 'text-ink-500 hover:text-primary-700 hover:bg-primary-50'
                }`}
                aria-label="增大字体"
              >
                A+
              </button>
            </div>

            {/* 暗色模式切换 */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              className={`p-2 rounded-xl transition-colors ${
                darkMode
                  ? 'text-gold-400 hover:bg-white/5'
                  : 'text-ink-500 hover:text-primary-700 hover:bg-primary-50'
              }`}
              aria-label="切换主题"
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* 离线状态 */}
            <span
              className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                offline
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
              title={offline ? '当前离线：已读过的章节仍可阅读' : '在线'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${offline ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {offline ? '离线可用' : '在线'}
            </span>

            {/* 侧边栏按钮（md+） */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`hidden md:flex p-2 rounded-xl transition-colors ${
                darkMode
                  ? 'text-ink-400 hover:text-white hover:bg-white/5'
                  : 'text-ink-500 hover:text-primary-700 hover:bg-primary-50'
              } ${sidebarOpen ? (darkMode ? 'bg-white/10 text-white' : 'bg-primary-100 text-primary-700') : ''}`}
              aria-label="书卷导航"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ===== 主体：经文 + 侧边栏 ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        <div className="flex gap-6 lg:gap-8">
          {/* === 侧边栏 === */}
          {sidebarOpen && (
            <aside
              className={`hidden md:block w-72 flex-shrink-0 rounded-3xl border p-5 shadow-soft h-fit sticky top-36 max-h-[calc(100vh-12rem)] overflow-y-auto ${sidebarBgClass}`}
            >
              <BookSidebar
                currentBookId={book}
                currentChapter={currentChapterNum}
                darkMode={darkMode}
                onSelect={(bookId, ch) => navigateTo(bookId, ch)}
              />
            </aside>
          )}

          {/* === 主内容 === */}
          <main className="flex-1 min-w-0">
            {/* 章节卡片 */}
            <article
              className={`rounded-3xl border shadow-soft overflow-hidden ${cardClass}`}
            >
              {/* 章节头部 */}
              <div
                className={`relative px-6 md:px-10 pt-8 md:pt-10 pb-4 ${
                  darkMode
                    ? 'bg-gradient-to-br from-primary-900/40 via-ink-900 to-ink-900'
                    : 'bg-gradient-to-br from-primary-50 via-white to-gold-50/30'
                }`}
              >
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold ${
                          darkMode
                            ? 'bg-primary-600 text-white'
                            : 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow'
                        }`}
                      >
                        {currentBook?.abbr ?? '?'}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          darkMode
                            ? 'bg-white/10 text-ink-300'
                            : 'bg-white border border-ink-200 text-ink-600'
                        }`}
                      >
                        {currentBook?.category ?? '--'}
                      </span>
                    </div>
                    <h1
                      className={`font-display text-2xl md:text-3xl font-bold ${
                        darkMode ? 'text-white' : 'text-ink-900'
                      }`}
                    >
                      {currentBook?.name ?? '未知书卷'}
                      <span className={darkMode ? 'text-ink-400' : 'text-ink-400'}> 第 </span>
                      <span className="text-gradient">{chapter}</span>
                      <span className={darkMode ? 'text-ink-400' : 'text-ink-400'}> 章</span>
                    </h1>
                    <p
                      className={`text-sm mt-1 ${
                        darkMode ? 'text-ink-400' : 'text-ink-500'
                      }`}
                    >
                      {currentVersion.name}
                    </p>
                  </div>

                  {/* 收藏 / 灵修笔记按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleFavorite}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        favorited
                          ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-gold'
                          : darkMode
                          ? 'bg-white/10 text-white hover:bg-white/20'
                          : 'bg-ink-50 text-ink-700 hover:bg-ink-100 border border-ink-200'
                      }`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill={favorited ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.098 10.1c-.783-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.519-4.674z"
                        />
                      </svg>
                      收藏本章
                    </button>
                    <button
                      onClick={openChapterNotes}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        markedVerses.length > 0
                          ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-gold'
                          : darkMode
                          ? 'bg-primary-600/30 text-primary-200 hover:bg-primary-600/50 border border-primary-500/30'
                          : 'bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      本章笔记{markedVerses.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[11px] font-bold leading-none">{markedVerses.length}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 分隔线 */}
              <div className={`h-px mx-6 md:mx-10 ${darkMode ? 'bg-white/5' : 'divider-gradient'}`} />

              {/* 经文内容 */}
              <div
                className={`px-6 md:px-10 py-8 md:py-10 ${
                  darkMode ? 'bg-ink-900/30' : 'bg-white'
                }`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {compareVersion && (
                  <div className={`mb-4 flex items-center gap-2 text-xs font-medium ${darkMode ? 'text-ink-400' : 'text-ink-500'}`}>
                    <span className={`px-2 py-1 rounded-full ${darkMode ? 'bg-white/10' : 'bg-ink-100'}`}>{currentVersion.name}</span>
                    <span>对照</span>
                    <span className={`px-2 py-1 rounded-full ${darkMode ? 'bg-white/10' : 'bg-ink-100'}`}>{compareVersionName}</span>
                    {compareLoading && <span className="text-amber-500">（加载中…）</span>}
                  </div>
                )}
                {verses && verses.length > 0 ? (
                  <div className="space-y-4 md:space-y-5 font-serif leading-[2] md:leading-[2.2]">
                    {verses.map((v, i) => {
                      const verseNo = i + 1;
                      const marked = !!bmMap[verseNo];
                      const cmp = compareVersion ? compareMap[verseNo] : undefined;
                      const numCol = (
                        <span className="flex-shrink-0 mt-1 flex items-center gap-0.5">
                          <sup
                            className={`text-xs font-bold w-5 text-center transition-colors ${marked ? (darkMode ? 'text-gold-300' : 'text-gold-600') : (darkMode ? 'text-primary-400 group-hover:text-primary-300' : 'text-primary-600 group-hover:text-primary-700')}`}
                          >
                            {verseNo}
                          </sup>
                          <button
                            type="button"
                            onClick={() => openNote(verseNo)}
                            title={marked ? '查看 / 编辑笔记' : '标记高亮并加笔记'}
                            className={`opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-5 h-5 inline-flex items-center justify-center rounded text-[12px] ${marked ? (darkMode ? 'text-gold-300' : 'text-gold-600') : (darkMode ? 'text-ink-400 hover:text-primary-300' : 'text-ink-400 hover:text-primary-600')}`}
                          >
                            {marked ? '✎' : '＋'}
                          </button>
                        </span>
                      );
                      const mainText = (
                        <span className={`${darkMode ? 'text-ink-100' : 'text-ink-800'} antialiased`}>
                          {v.text}
                        </span>
                      );
                      if (cmp !== undefined) {
                        return (
                          <div key={i} id={`verse-${verseNo}`} className={`group rounded-lg transition-colors ${marked ? (darkMode ? 'bg-gold-500/10 -mx-2 px-2' : 'bg-gold-50 -mx-2 px-2') : ''}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 py-1.5">
                              <p className="flex gap-2 md:gap-3 items-start leading-[2] md:leading-[2.2]">{numCol}{mainText}</p>
                              <p className={`flex gap-2 md:gap-3 items-start leading-[2] md:leading-[2.2] ${darkMode ? 'text-ink-300' : 'text-ink-500'}`}>
                                <span className="flex-shrink-0 mt-1 w-5" />
                                <span className="antialiased">{cmp || '—'}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <p key={i} id={`verse-${verseNo}`} className={`group flex gap-2 md:gap-3 items-start rounded-lg transition-colors ${marked ? (darkMode ? 'bg-gold-500/10 -mx-2 px-2' : 'bg-gold-50 -mx-2 px-2') : ''}`}>
                          {numCol}{mainText}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <div
                      className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
                        darkMode ? 'bg-white/5' : 'bg-ink-50'
                      }`}
                    >
                      <svg
                        className={`w-8 h-8 ${
                          darkMode ? 'text-ink-500' : 'text-ink-300'
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                    </div>
                    <p
                      className={`font-serif text-lg ${
                        darkMode ? 'text-ink-400' : 'text-ink-500'
                      }`}
                    >
                      暂无经文内容
                    </p>
                    <p
                      className={`text-sm mt-1 ${
                        darkMode ? 'text-ink-600' : 'text-ink-400'
                      }`}
                    >
                      该章节内容正在筹备中，敬请期待
                    </p>
                  </div>
                )}
              </div>

              {/* 底部导航 */}
              <div
                className={`px-6 md:px-10 py-5 flex items-center justify-between gap-3 border-t ${
                  darkMode
                    ? 'bg-ink-900/50 border-white/5'
                    : 'bg-ink-50/50 border-ink-100'
                }`}
              >
                <button
                  onClick={goPrevChapter}
                  disabled={prevDisabled}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    prevDisabled
                      ? darkMode
                        ? 'text-ink-600 cursor-not-allowed'
                        : 'text-ink-300 cursor-not-allowed'
                      : darkMode
                      ? 'text-ink-200 hover:text-white hover:bg-white/10'
                      : 'text-ink-700 hover:text-primary-700 hover:bg-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  上一章
                </button>
                <span
                  className={`text-xs ${
                    darkMode ? 'text-ink-500' : 'text-ink-400'
                  }`}
                >
                  {currentBook?.name ?? '--'} · {chapter}章
                </span>
                <button
                  onClick={goNextChapter}
                  disabled={nextDisabled}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    nextDisabled
                      ? darkMode
                        ? 'text-ink-600 cursor-not-allowed'
                        : 'text-ink-300 cursor-not-allowed'
                      : darkMode
                      ? 'text-ink-200 hover:text-white hover:bg-white/10'
                      : 'text-ink-700 hover:text-primary-700 hover:bg-white'
                  }`}
                >
                  下一章
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </article>
          </main>
        </div>
      </div>

      {/* ===== 移动端底部 Sheet ===== */}
      {mobileSheetOpen && (
        <MobileBookSheet
          currentBookId={book}
          currentChapter={currentChapterNum}
          darkMode={darkMode}
          onClose={() => setMobileSheetOpen(false)}
          onSelect={(bookId, ch) => navigateTo(bookId, ch)}
        />
      )}

      {/* ===== 经文笔记编辑面板 ===== */}
      {noteVerse != null && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setNoteVerse(null)}
        >
          <div
            className={`w-full md:max-w-lg md:rounded-2xl rounded-t-2xl p-5 shadow-card ${darkMode ? 'bg-ink-900 text-ink-100' : 'bg-white text-ink-900'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold">
                {currentBook?.name} 第 {chapter} 章 : {noteVerse}
              </h3>
              <button
                onClick={() => setNoteVerse(null)}
                className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${darkMode ? 'text-ink-400 hover:text-white hover:bg-white/10' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100'}`}
              >
                ✕
              </button>
            </div>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, 280))}
              placeholder="写下你的领受、疑问或祷告…（最多 280 字）"
              rows={4}
              className={`w-full rounded-xl border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${darkMode ? 'bg-ink-800 border-white/10 text-ink-100 placeholder:text-ink-500' : 'bg-ink-50 border-ink-200 text-ink-900 placeholder:text-ink-400'}`}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-ink-400">{noteDraft.length}/280</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => removeMark(noteVerse)}
                  disabled={bmBusy}
                  className="px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  删除高亮
                </button>
                <button
                  onClick={saveNote}
                  disabled={bmBusy}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-700 shadow-glow disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 本章笔记列表面板 ===== */}
      {chapterNotesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setChapterNotesOpen(false)}
        >
          <div
            className={`w-full md:max-w-lg md:rounded-2xl rounded-t-2xl p-5 shadow-card max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-ink-900 text-ink-100' : 'bg-white text-ink-900'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold">本章笔记（{markedVerses.length}）</h3>
              <button
                onClick={() => setChapterNotesOpen(false)}
                className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${darkMode ? 'text-ink-400 hover:text-white hover:bg-white/10' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100'}`}
              >
                ✕
              </button>
            </div>
            {bmLoading ? (
              <p className="text-sm text-ink-400 py-6 text-center">加载中…</p>
            ) : markedVerses.length === 0 ? (
              <p className="text-sm text-ink-400 py-6 text-center">
                本章还没有高亮或笔记。
                <br />
                把鼠标移到节号旁的 ＋ 即可标记。
              </p>
            ) : (
              <div className="space-y-2">
                {markedVerses.map((vn) => (
                  <div
                    key={vn}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'border-white/10 bg-ink-800/50' : 'border-ink-100 bg-ink-50/50'}`}
                  >
                    <button
                      onClick={() => {
                        setChapterNotesOpen(false);
                        openNote(vn);
                      }}
                      className="flex-shrink-0 font-semibold text-primary-600 text-sm pt-0.5"
                    >
                      {vn}节
                    </button>
                    <p className="flex-1 text-sm text-ink-600 dark:text-ink-300 whitespace-pre-wrap break-words min-w-0">
                      {bmMap[vn].note || <span className="text-ink-400">（仅高亮，无笔记）</span>}
                    </p>
                    <button
                      onClick={() => removeMark(vn)}
                      className="flex-shrink-0 text-ink-300 hover:text-rose-500 text-xs px-1"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="px-5 py-3 rounded-2xl bg-ink-900 text-white text-sm font-medium shadow-card">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== 侧边栏组件 ===================== */

function BookSidebar({
  currentBookId,
  currentChapter,
  darkMode,
  onSelect,
}: {
  currentBookId: string;
  currentChapter: number;
  darkMode: boolean;
  onSelect: (bookId: string, chapter: number) => void;
}) {
  const [testament, setTestament] = useState<Testament>(() =>
    bibleData.books.old.some((b) => b.id === currentBookId) ? 'old' : 'new'
  );
  const groups = testament === 'old' ? bibleData.books.old : bibleData.books.new;

  return (
    <div>
      {/* 旧约 / 新约 切换 */}
      <div
        className={`flex rounded-xl p-1 mb-4 ${
          darkMode ? 'bg-white/5' : 'bg-ink-100'
        }`}
      >
        <button
          onClick={() => setTestament('old')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            testament === 'old'
              ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30'
              : darkMode
              ? 'text-ink-300 hover:text-white'
              : 'text-ink-600 hover:text-primary-700'
          }`}
        >
          旧约
        </button>
        <button
          onClick={() => setTestament('new')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            testament === 'new'
              ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-lg shadow-gold-500/30'
              : darkMode
              ? 'text-ink-300 hover:text-white'
              : 'text-ink-600 hover:text-primary-700'
          }`}
        >
          新约
        </button>
      </div>

      {/* 书卷列表 */}
      <div className="space-y-1">
        {groups.map((b) => {
          const active = b.id === currentBookId;
          return (
            <details
              key={b.id}
              open={active}
              className={`group rounded-xl overflow-hidden transition-colors ${
                darkMode ? 'bg-white/[0.02] hover:bg-white/[0.05]' : 'bg-ink-50/50 hover:bg-ink-50'
              }`}
            >
              <summary
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none select-none ${
                  active
                    ? darkMode
                      ? 'text-primary-300'
                      : 'text-primary-700'
                    : darkMode
                    ? 'text-ink-200'
                    : 'text-ink-800'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    active
                      ? testament === 'old'
                        ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
                        : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white'
                      : darkMode
                      ? 'bg-white/10 text-ink-400'
                      : 'bg-white border border-ink-200 text-ink-500'
                  }`}
                >
                  {b.abbr}
                </span>
                <span className="flex-1 text-sm font-medium">{b.name}</span>
                <span className={`text-xs ${darkMode ? 'text-ink-500' : 'text-ink-400'}`}>
                  {b.chapters}章
                </span>
                <svg
                  className={`w-4 h-4 transition-transform group-open:rotate-180 ${
                    darkMode ? 'text-ink-500' : 'text-ink-400'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              {active && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => {
                      const isCurrent = ch === currentChapter;
                      return (
                        <button
                          key={ch}
                          onClick={() => onSelect(b.id, ch)}
                          className={`h-8 rounded-lg text-xs font-medium transition-all ${
                            isCurrent
                              ? testament === 'old'
                                ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/30'
                                : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-md shadow-gold-500/30'
                              : darkMode
                              ? 'bg-white/5 text-ink-300 hover:bg-white/15 hover:text-white'
                              : 'bg-white border border-ink-200 text-ink-700 hover:border-primary-300 hover:text-primary-700'
                          }`}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== 移动端底部 Sheet ===================== */

function MobileBookSheet({
  currentBookId,
  currentChapter,
  darkMode,
  onClose,
  onSelect,
}: {
  currentBookId: string;
  currentChapter: number;
  darkMode: boolean;
  onClose: () => void;
  onSelect: (bookId: string, chapter: number) => void;
}) {
  const [testament, setTestament] = useState<Testament>(() =>
    bibleData.books.old.some((b) => b.id === currentBookId) ? 'old' : 'new'
  );
  const [expanded, setExpanded] = useState<string | null>(currentBookId);
  const groups = testament === 'old' ? bibleData.books.old : bibleData.books.new;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 md:hidden" data-guard="bible-drawer">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 rounded-t-3xl animate-slide-up max-h-[85vh] overflow-hidden ${
          darkMode ? 'bg-ink-900 text-white' : 'bg-white'
        }`}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className={`w-10 h-1.5 rounded-full ${
              darkMode ? 'bg-white/20' : 'bg-ink-200'
            }`}
          />
        </div>

        <div className="px-5 pb-5 overflow-y-auto max-h-[calc(85vh-2rem)]">
          {/* 旧约 / 新约 */}
          <div className="flex rounded-xl p-1 mb-4 bg-ink-100/60">
            <button
              onClick={() => {
                setTestament('old');
                setExpanded(null);
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                testament === 'old'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30'
                  : darkMode
                  ? 'text-ink-300'
                  : 'text-ink-600'
              }`}
            >
              旧约
            </button>
            <button
              onClick={() => {
                setTestament('new');
                setExpanded(null);
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                testament === 'new'
                  ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-white shadow-lg shadow-gold-500/30'
                  : darkMode
                  ? 'text-ink-300'
                  : 'text-ink-600'
              }`}
            >
              新约
            </button>
          </div>

          {/* 书卷 */}
          <div className="space-y-2 pb-4">
            {groups.map((b) => {
              const active = b.id === currentBookId;
              const isOpen = expanded === b.id;
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl overflow-hidden ${
                    darkMode ? 'bg-white/[0.04]' : 'bg-ink-50'
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
                      active && !isOpen
                        ? testament === 'old'
                          ? 'bg-primary-500/10'
                          : 'bg-gold-500/10'
                        : ''
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        active
                          ? testament === 'old'
                            ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow'
                            : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-gold'
                          : darkMode
                          ? 'bg-white/10 text-ink-300'
                          : 'bg-white border border-ink-200 text-ink-600'
                      }`}
                    >
                      {b.abbr}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-semibold ${
                          active
                            ? testament === 'old'
                              ? 'text-primary-700'
                              : 'text-gold-700'
                            : darkMode
                            ? 'text-white'
                            : 'text-ink-900'
                        }`}
                      >
                        {b.name}
                      </div>
                      <div
                        className={`text-xs ${
                          darkMode ? 'text-ink-400' : 'text-ink-500'
                        }`}
                      >
                        {b.category} · {b.chapters}章
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      } ${darkMode ? 'text-ink-400' : 'text-ink-400'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className={`px-4 pb-4 ${darkMode ? 'bg-black/20' : 'bg-white/50'}`}>
                      <div className="grid grid-cols-7 gap-2 pt-2">
                        {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => {
                          const isCurrent = ch === currentChapter && active;
                          return (
                            <button
                              key={ch}
                              onClick={() => {
                                onSelect(b.id, ch);
                                onClose();
                              }}
                              className={`h-9 rounded-lg text-sm font-semibold transition-all ${
                                isCurrent
                                  ? testament === 'old'
                                    ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/30'
                                    : 'bg-gradient-to-br from-gold-500 to-gold-600 text-white shadow-md shadow-gold-500/30'
                                  : darkMode
                                  ? 'bg-white/10 text-ink-200 hover:bg-white/20'
                                  : 'bg-ink-50 text-ink-700 hover:bg-primary-100 hover:text-primary-700'
                              }`}
                            >
                              {ch}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

export default BibleReader;
