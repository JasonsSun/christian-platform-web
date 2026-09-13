'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { api, apiPost, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSpeech, type SpeechItem } from '@/lib/useSpeech';
import { splitVerse, hasNotes, stripNotes } from '@/lib/verseText';
import ReadingAngel from '@/components/ReadingAngel';
import ShareModal from '@/components/ShareModal';
import { useTheme } from '@/lib/theme';

/** 可供「对照阅读」的译本（与 @/server/bible 的 VERSIONS 保持一致） */
const CMP_VERSIONS = [
  { id: 'cuv', label: '和合本' },
  { id: 'cuvs', label: '和合本修订版' },
  { id: 'kjv', label: 'KJV 钦定本' },
];

type VerseItem = { verse: number; text: string };
type ChapterResp = {
  version: string;
  book: { id: string; name: string; abbr: string; chapters: number; testament: 'old' | 'new' };
  chapter: number;
  verses: VerseItem[];
  availableChapters: number[];
  hasContent: boolean;
};
type BookmarkItem = { id: string; version: string; bookId: string; chapter: number; verse: number; note?: string; bookName?: string };
type BookmarkResp = { items: BookmarkItem[] };
type ToggleBookmarkResp = { bookmarked: boolean };

const FONT: Record<string, string> = {
  sm: 'text-base sm:text-lg',
  md: 'text-lg sm:text-xl',
  lg: 'text-xl sm:text-2xl',
  xl: 'text-2xl sm:text-3xl',
};
const LH: Record<string, string> = {
  tight: 'leading-relaxed',
  normal: 'leading-loose',
  loose: 'leading-[2.2]',
};
const WIDTH: Record<string, string> = {
  narrow: 'max-w-2xl',
  medium: 'max-w-3xl',
  wide: 'max-w-4xl',
};
type ReadTheme = 'light' | 'dark' | 'sepia';
type FontSize = 'sm' | 'md' | 'lg' | 'xl';
type LineHeight = 'tight' | 'normal' | 'loose';
type ReadWidth = 'narrow' | 'medium' | 'wide';

export default function ReadChapter() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const version = (params.version as string) || 'cuv';
  const book = (params.book as string) || 'john';
  const chapter = Number(params.chapter) || 1;

  const path = `/bible/chapter${qs({ version, book, chapter })}`;
  const { data, loading, error, reload } = useApi<ChapterResp>(path);

  const [fontSize, setFontSize] = useState<FontSize>('md');
  const [lineHeight, setLineHeight] = useState<LineHeight>('normal');
  const [serifFont, setSerifFont] = useState(true);
  const [readWidth, setReadWidth] = useState<ReadWidth>('medium');
  const { theme: globalTheme } = useTheme();
  // 读经页主题默认跟随全站主题；用户若曾在读经页单独选过（bible:theme），以该选择为准
  const [readTheme, setReadTheme] = useState<ReadTheme>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bible:theme');
      if (saved === 'light' || saved === 'dark' || saved === 'sepia') return saved as ReadTheme;
    }
    return (globalTheme as ReadTheme) || 'light';
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [autoNextChapter, setAutoNextChapter] = useState(false);

  // 本章书签状态：0 表示整章收藏，>0 表示单节收藏
  const [chapterBookmarked, setChapterBookmarked] = useState(false);
  const [verseBookmarks, setVerseBookmarks] = useState<Set<number>>(new Set());
  const [noteEditing, setNoteEditing] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  // ---- 多译本对照阅读 ----
  // 选定第二译本后，逐节在正文下方附上对照译文（不改动原有排版，移动端友好）。
  const [cmpVersion, setCmpVersion] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bible:cmpVersion');
      if (saved && CMP_VERSIONS.some((v) => v.id === saved)) return saved;
    }
    return '';
  });
  const [cmpVerses, setCmpVerses] = useState<Record<number, string>>({});
  const [cmpLoading, setCmpLoading] = useState(false);

  const changeCmpVersion = (v: string) => {
    setCmpVersion(v);
    try { localStorage.setItem('bible:cmpVersion', v); } catch { /* ignore */ }
  };

  // 拉取对照译本内容（同一书卷同一章）；切章 / 切换译本时自动重取
  useEffect(() => {
    if (!cmpVersion || cmpVersion === version) {
      setCmpVerses({});
      return;
    }
    let alive = true;
    setCmpLoading(true);
    api<ChapterResp>(`/bible/chapter${qs({ version: cmpVersion, book, chapter })}`)
      .then((res) => {
        if (!alive) return;
        const map: Record<number, string> = {};
        for (const v of res?.verses ?? []) map[v.verse] = stripNotes(v.text);
        setCmpVerses(map);
      })
      .catch(() => { if (alive) setCmpVerses({}); })
      .finally(() => { if (alive) setCmpLoading(false); });
    return () => { alive = false; };
  }, [cmpVersion, version, book, chapter]);

  const bmPath = user ? `/bible/bookmarks${qs({ book, chapter })}` : null;
  const { data: bmList, loading: bmLoading, error: bmError, reload: reloadBm } = useApi<BookmarkResp>(
    bmPath,
    [user, book, chapter]
  );
  const bookmarkAction = useAction();
  const readAction = useAction();

  // 语音朗读：逐节朗读，读到哪节就高亮哪节（朗读文本剔除括号注释）
  const speechItems = useMemo<SpeechItem[]>(
    () => (data?.verses ?? []).map((v) => ({ key: v.verse, text: stripNotes(v.text) })),
    [data?.verses]
  );
  const articleRef = useRef<HTMLElement>(null);

  // 跳节阅读：选中的节会滚动定位 + 高亮，并作为朗读起点
  const [startVerse, setStartVerse] = useState<number | null>(null);
  // 括号注释（译注）：true = 阅读时隐藏；朗读无论开关都跳过注释。
  // 偏好记在 localStorage，默认隐藏以得到更纯净的读经体验。
  const [skipNotes, setSkipNotes] = useState(true);
  // 本章是否含括号注释（决定要不要显示开关）
  const chapterHasNotes = useMemo(
    () => (data?.verses ?? []).some((v) => hasNotes(v.text)),
    [data?.verses]
  );

  useEffect(() => {
    try {
      const v = localStorage.getItem('bible:skipNotes');
      if (v === '0' || v === '1') setSkipNotes(v === '1');
    } catch { /* ignore */ }
  }, []);
  const toggleSkipNotes = () => {
    const next = !skipNotes;
    setSkipNotes(next);
    try { localStorage.setItem('bible:skipNotes', next ? '1' : '0'); } catch { /* ignore */ }
  };

  // 朗读播报：开头念「书名 第 N 章」；每节前念「第 N 节」。
  // 两者都可关，偏好记在 localStorage。
  const [announceChapter, setAnnounceChapter] = useState(true);
  const [announceVerse, setAnnounceVerse] = useState(true);
  useEffect(() => {
    try {
      const a = localStorage.getItem('bible:announceChapter');
      if (a === '0' || a === '1') setAnnounceChapter(a === '1');
      const b = localStorage.getItem('bible:announceVerse');
      if (b === '0' || b === '1') setAnnounceVerse(b === '1');
    } catch { /* ignore */ }
  }, []);
  const toggleAnnounceChapter = () => {
    const next = !announceChapter;
    setAnnounceChapter(next);
    try { localStorage.setItem('bible:announceChapter', next ? '1' : '0'); } catch { /* ignore */ }
  };
  const toggleAnnounceVerse = () => {
    const next = !announceVerse;
    setAnnounceVerse(next);
    try { localStorage.setItem('bible:announceVerse', next ? '1' : '0'); } catch { /* ignore */ }
  };

  // 读取排版与主题偏好（首次挂载时）
  useEffect(() => {
    try {
      const f = localStorage.getItem('bible:font');
      if (f === 'sm' || f === 'md' || f === 'lg' || f === 'xl') setFontSize(f);
      const lh = localStorage.getItem('bible:lh');
      if (lh === 'tight' || lh === 'normal' || lh === 'loose') setLineHeight(lh);
      const sf = localStorage.getItem('bible:serif');
      if (sf === '0' || sf === '1') setSerifFont(sf === '1');
      const w = localStorage.getItem('bible:width');
      if (w === 'narrow' || w === 'medium' || w === 'wide') setReadWidth(w);
      const th = localStorage.getItem('bible:theme');
      if (th === 'light' || th === 'dark' || th === 'sepia') setReadTheme(th);
    } catch { /* ignore */ }
  }, []);
  // 排版/主题偏好变化即持久化
  useEffect(() => { try { localStorage.setItem('bible:font', fontSize); } catch { /* ignore */ } }, [fontSize]);
  useEffect(() => { try { localStorage.setItem('bible:lh', lineHeight); } catch { /* ignore */ } }, [lineHeight]);
  useEffect(() => { try { localStorage.setItem('bible:serif', serifFont ? '1' : '0'); } catch { /* ignore */ } }, [serifFont]);
  useEffect(() => { try { localStorage.setItem('bible:width', readWidth); } catch { /* ignore */ } }, [readWidth]);
  useEffect(() => { try { localStorage.setItem('bible:theme', readTheme); } catch { /* ignore */ } }, [readTheme]);

  // 「读完自动下一章」：朗读自然读完时触发，用 ref 取最新值避免回调闭包过期
  const autoNextRef = useRef(false);
  const nextChapterRef = useRef<number | null>(null);

  // 语音朗读：逐节朗读。播报文案随开关变化（换章时 leadText 自动变为新章节名）
  const speech = useSpeech(speechItems, {
    lang: 'zh-CN',
    leadText: announceChapter && data ? `${data.book.name} 第 ${data.chapter} 章` : null,
    announceKey: announceVerse,
    onEnd: () => {
      if (!autoNextRef.current) return;
      const n = nextChapterRef.current;
      if (n) {
        setToast(`本章读完，自动进入第 ${n} 章`);
        setTimeout(() => setToast(null), 2000);
        router.push(`/bible/${version}/${book}/${n}?autoread=1`);
      } else {
        setAutoNextChapter(false);
        setToast('已读到本卷最后一章');
        setTimeout(() => setToast(null), 2000);
      }
    },
  });

  /** 跳到指定节：滚动定位 + 高亮 + 写入 URL（不触发导航，便于分享到某节） */
  const scrollToVerse = (n: number) => {
    if (!n || n <= 0) return;
    setStartVerse(n);
    const el = document.getElementById(`v${n}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(n));
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  };

  /** 点击某节经文：滚动定位 + 写入 URL + 从这一节开始朗读 */
  const startFrom = (verse: number) => {
    if (!verse || verse <= 0) return;
    setStartVerse(verse);
    const el = document.getElementById(`v${verse}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(verse));
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
    speech.start(verse);
  };

  // 带 ?v=N 进入时定位到该节
  useEffect(() => {
    if (!data?.hasContent) return;
    const v = Number(searchParams.get('v'));
    if (!v || v <= 0) {
      // 换章且未指定节时清掉上一章的选中态
      setStartVerse(null);
      return;
    }
    setStartVerse(v);
    const t = setTimeout(() => {
      const el = document.getElementById(`v${v}`);
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasContent, data?.chapter, book, version]);

  // 进入时根据本章书签列表初始化高亮状态（verse=0 视为整章收藏）
  useEffect(() => {
    if (!bmList) return;
    const nextSet = new Set<number>();
    let chapterBm = false;
    for (const it of bmList.items) {
      if (it.verse === 0) chapterBm = true;
      else nextSet.add(it.verse);
    }
    setChapterBookmarked(chapterBm);
    setVerseBookmarks(nextSet);
  }, [bmList]);

  const chapters = data?.availableChapters ?? [];
  const idx = chapters.indexOf(chapter);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  // 把最新状态同步给 onEnd 回调（朗读自然读完时决定是否跳下一章）
  useEffect(() => { autoNextRef.current = autoNextChapter; }, [autoNextChapter]);
  useEffect(() => { nextChapterRef.current = next; }, [next]);

  // 记住阅读位置（供「继续阅读」使用，未登录也能用）
  useEffect(() => {
    if (!data?.hasContent) return;
    try {
      localStorage.setItem(
        'bible:last',
        JSON.stringify({ version, bookId: book, chapter, bookName: data.book.name })
      );
    } catch {
      /* ignore */
    }
  }, [data?.hasContent, data?.chapter, book, version]);

  // 朗读时自动滚动到当前节
  useEffect(() => {
    if (speech.speakingKey == null) return;
    const el = document.getElementById(`v${speech.speakingKey}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [speech.speakingKey]);

  // 逐字高亮:朗读时按全局字符索引实时标记「正在读/已读」单字(直接操作 DOM,避免逐字重渲整棵树)
  useEffect(() => {
    const container = articleRef.current;
    if (!container) return;
    const clearAll = () => {
      container
        .querySelectorAll('.verse-char.read, .verse-char.active')
        .forEach((e) => e.classList.remove('read', 'active'));
    };
    // 语速不是 1.0x 时只保留整节(整行)高亮,不做逐字着色(倍速下逐字位置会漂移)
    if (speech.speakingKey == null || !speech.wordSync) {
      clearAll();
      return;
    }
    let raf = 0;
    let last = -1;
    const paint = (cur: number | null) => {
      if (cur == null || cur < 0) {
        clearAll();
        last = -1;
        return;
      }
      if (cur < last) clearAll(); // 回退/换段,重新从头标记
      for (let r = Math.max(0, last + 1); r <= cur; r++) {
        const el = container.querySelector(`[data-raw="${r}"]`);
        if (el) el.classList.add('read');
      }
      container
        .querySelectorAll('.verse-char.active')
        .forEach((e) => e.classList.remove('active'));
      const curEl = container.querySelector(`[data-raw="${cur}"]`);
      if (curEl) curEl.classList.add('active');
      last = cur;
    };
    const loop = () => {
      paint(speech.speakCharRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speech.speakingKey, speech.wordSync]);

  // 由上一章自动连播跳转而来时，内容就绪后自动开读
  // 由上一章自动连播跳转而来时，内容就绪后自动开读。
  // 注意：换章是同一路由段、组件实例复用，去重必须按「章号」记，不能只记 boolean
  // （否则只能自动连播一章，第二章起就停住）。
  const autoReadDone = useRef<number | null>(null);
  useEffect(() => {
    if (searchParams.get('autoread') !== '1') return;
    if (!data?.hasContent) return;
    if (autoReadDone.current === chapter) return;
    autoReadDone.current = chapter;
    setAutoNextChapter(true);
    const t = setTimeout(() => speech.start(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasContent, data?.chapter]);

  // 阅读进度条（按本章内容在视口中的滚动比例）
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!data?.hasContent) { setProgress(0); return; }
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (h.scrollTop / max) * 100)) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [data?.hasContent, data?.chapter]);

  // 朗读时保持屏幕常亮（WakeLock；Safari/iOS 不支持则静默降级）
  useEffect(() => {
    if (speech.state !== 'playing') return;
    let lock: { release: () => Promise<void> } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen');
        }
      } catch { /* 不支持或被拒：忽略 */ }
    };
    acquire();
    // 页面切回前台后重新申请（系统会在后台自动释放）
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearTimeout(timer);
      if (lock) lock.release().catch(() => {});
    };
  }, [speech.state]);

  // 键盘快捷键：←/→ 翻章，空格 播放/暂停（输入框聚焦时忽略）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prev) {
        router.push(`/bible/${version}/${book}/${prev}`);
      } else if (e.key === 'ArrowRight' && next) {
        router.push(`/bible/${version}/${book}/${next}`);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (speech.state === 'playing') speech.pause();
        else if (speech.state === 'paused') speech.resume();
        else speech.start(startVerse ?? undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev, next, speech.state, speech.supported, startVerse]);

  const buildText = () => {
    if (!data) return '';
    const head = `${data.book.name} 第 ${data.chapter} 章（${data.version}）\n`;
    const body = data.verses.map((v) => `${v.verse} ${v.text}`).join('\n');
    return head + body;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 打开分享弹窗（内含「生成经文分享卡片图」+ 二维码 + 复制/系统分享）
  const handleShare = () => {
    setShareOpen(true);
  };

  // 分享卡片内容：优先当前选中节，否则第一章第 1 节
  const shareCard = (() => {
    if (!data?.verses?.length) return undefined;
    const v = (startVerse && data.verses.find((x) => x.verse === startVerse)) || data.verses[0];
    if (!v) return undefined;
    return {
      eyebrow: `${data.book.name} 第 ${chapter} 章`,
      text: v.text,
      reference: `${data.book.name} ${chapter}:${v.verse}${data.version ? ` · ${data.version.toUpperCase()}` : ''}`,
    };
  })();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const toggleChapterBookmark = async () => {
    if (!user) {
      showToast('请先登录');
      return;
    }
    const res = await bookmarkAction.run(() =>
      apiPost<ToggleBookmarkResp>('/bible/bookmarks', { version, bookId: book, chapter, verse: 0 })
    );
    if (res) {
      setChapterBookmarked(res.bookmarked);
      setVerseBookmarks((prevSet) => {
        const nextSet = new Set(prevSet);
        if (res.bookmarked) nextSet.delete(0);
        else nextSet.add(0);
        return nextSet;
      });
    }
  };

  const toggleVerseBookmark = async (verse: number) => {
    if (!user) {
      showToast('请先登录');
      return;
    }
    const res = await bookmarkAction.run(() =>
      apiPost<ToggleBookmarkResp>('/bible/bookmarks', { version, bookId: book, chapter, verse })
    );
    if (res) {
      setVerseBookmarks((prevSet) => {
        const nextSet = new Set(prevSet);
        if (res.bookmarked) nextSet.add(verse);
        else nextSet.delete(verse);
        return nextSet;
      });
    }
  };

  const saveNote = async (verse: number) => {
    if (!user) {
      showToast('请先登录');
      return;
    }
    const note = noteDraft; // 允许清空笔记(后端 upsert 不再删除收藏)
    const res = await bookmarkAction.run(() =>
      apiPost<ToggleBookmarkResp>('/bible/bookmarks', { version, bookId: book, chapter, verse, note })
    );
    if (res) {
      // 笔记与书签绑定: 保存成功后重新拉取书签列表, 后续 effect 会同步高亮
      await reloadBm();
      setNoteEditing(null);
      setNoteDraft('');
      showToast('笔记已保存');
    }
  };

  const markRead = async () => {
    if (!user) {
      showToast('请先登录');
      return;
    }
    const res = await readAction.run(() =>
      apiPost<{ ok: boolean }>('/bible/history', { version, bookId: book, chapter })
    );
    if (res?.ok) showToast('已记录读经');
  };

  return (
    <div className={`read-page min-h-screen ${readTheme === 'dark' ? 'text-[#dcdbd4]' : readTheme === 'sepia' ? 'text-[#4a3f2f]' : ''}`} data-read-theme={readTheme}>
      {data?.hasContent && (
        <div className="read-progress" style={{ width: `${progress}%` }} aria-hidden />
      )}
      <div className={`max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${WIDTH[readWidth] === 'max-w-3xl' ? '' : WIDTH[readWidth]}`}>
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/bible/${version}`}
            className="inline-flex items-center gap-1 text-ink-500 hover:text-primary-600 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {version}
          </Link>

          {/* 字号调节 + 排版/主题设置 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white rounded-full p-1 shadow-soft border border-ink-100">
              {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`w-9 h-8 inline-flex items-center justify-center rounded-full font-bold font-serif transition-colors ${
                    fontSize === size ? 'bg-primary-600 text-white' : 'text-ink-500 hover:text-primary-600'
                  }`}
                  title={size === 'sm' ? '小号字' : size === 'md' ? '中号字' : size === 'lg' ? '大号字' : '特大号字'}
                >
                  <span className={size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : size === 'lg' ? 'text-lg' : 'text-xl'}>A</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className={`inline-flex items-center justify-center w-10 h-10 rounded-full shadow-soft border transition-colors ${
                  settingsOpen ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-ink-600 border-ink-100 hover:text-primary-600'
                }`}
                title="阅读排版与主题"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
                  <div className="absolute right-0 top-12 z-40 w-72 bg-white rounded-2xl shadow-card-hover border border-ink-100 p-4 text-ink-800">
                    {/* 主题 */}
                    <div className="text-xs font-semibold text-ink-500 mb-2">主题</div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {([
                        { k: 'light', label: '日间', bg: 'linear-gradient(135deg,#ffffff,#f1f5f9)', fg: '#1f2339' },
                        { k: 'dark', label: '夜间', bg: 'linear-gradient(135deg,#1b2230,#0e1116)', fg: '#dcdbd4' },
                        { k: 'sepia', label: '护眼', bg: 'linear-gradient(135deg,#fbf4e6,#efe2c6)', fg: '#5b4a32' },
                      ] as const).map((t) => (
                        <button
                          key={t.k}
                          onClick={() => setReadTheme(t.k)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-all ${
                            readTheme === t.k ? 'border-primary-500 ring-2 ring-primary-200' : 'border-ink-200 hover:border-primary-300'
                          }`}
                        >
                          <span className="w-10 h-10 rounded-lg border border-black/5" style={{ background: t.bg }} />
                          <span className="text-xs text-ink-600">{t.label}</span>
                        </button>
                      ))}
                    </div>
                    {/* 行距 */}
                    <div className="text-xs font-semibold text-ink-500 mb-2">行距</div>
                    <div className="flex gap-2 mb-4">
                      {([['tight', '紧凑'], ['normal', '舒适'], ['loose', '宽松']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setLineHeight(k)}
                          className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                            lineHeight === k ? 'bg-primary-600 text-white border-primary-600' : 'bg-ink-50 text-ink-600 border-ink-200 hover:border-primary-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* 字体 */}
                    <div className="text-xs font-semibold text-ink-500 mb-2">字体</div>
                    <div className="flex gap-2 mb-4">
                      {([['serif', '衬线'], ['sans', '黑体']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setSerifFont(k === 'serif')}
                          className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                            (k === 'serif') === serifFont ? 'bg-primary-600 text-white border-primary-600' : 'bg-ink-50 text-ink-600 border-ink-200 hover:border-primary-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* 宽度 */}
                    <div className="text-xs font-semibold text-ink-500 mb-2">正文宽度</div>
                    <div className="flex gap-2">
                      {([['narrow', '窄'], ['medium', '标准'], ['wide', '宽']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setReadWidth(k)}
                          className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                            readWidth === k ? 'bg-primary-600 text-white border-primary-600' : 'bg-ink-50 text-ink-600 border-ink-200 hover:border-primary-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">设置自动保存，下次打开读经页沿用。</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 标题 */}
        <div className="text-center mb-8 relative">
          {/* 装饰线 */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/50"></div>
            <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-300/50"></div>
          </div>
          
          <h1 className="font-display text-3xl md:text-4xl font-bold text-ink-900 mb-2">{data?.book.name ?? book}</h1>
          <p className="text-ink-400 text-sm">第 {chapter} 章 · {data?.book.abbr || '创'} · {version === 'cuvs' ? '和合本' : 'KJV'}</p>
          
          {/* 底部装饰 */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className="h-px flex-1 bg-gradient-to-r from-amber-300/50 to-transparent"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
            <div className="h-px flex-1 bg-gradient-to-l from-amber-300/50 to-transparent"></div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 text-rose-600 text-sm">
            加载失败：{error}
            <button onClick={reload} className="ml-3 underline">重试</button>
          </div>
        )}

        {loading && (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-6 bg-ink-100 rounded w-full" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        )}

        {!loading && data && !data.hasContent && (
          <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
            <div className="text-5xl mb-4">📖</div>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">本章暂无该译本数据</h3>
            <p className="text-ink-500 mb-6">《{data.book.name}》第 {chapter} 章在「{version}」译本中尚未收录。</p>
            <div className="flex justify-center gap-3">
              {prev && (
                <Link href={`/bible/${version}/${book}/${prev}`} className="btn-secondary px-5 py-2.5 text-sm">上一章</Link>
              )}
              {next && (
                <Link href={`/bible/${version}/${book}/${next}`} className="btn-primary px-5 py-2.5 text-sm">下一章</Link>
              )}
              {!prev && !next && (
                <Link href={`/bible/${version}`} className="btn-primary px-5 py-2.5 text-sm">返回书卷</Link>
              )}
            </div>
          </div>
        )}

        {!loading && data && data.hasContent && (
          <>
            {/* 书签 / 已读 工具栏 */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <button
                onClick={toggleChapterBookmark}
                disabled={!user || bookmarkAction.pending || bmLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  chapterBookmarked
                    ? 'bg-gold-500 border-gold-500 text-white shadow-gold-500/30'
                    : 'bg-white border-ink-200 text-ink-700 hover:border-gold-400 hover:text-gold-600'
                } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={chapterBookmarked ? '取消整章书签' : '收藏整章'}
              >
                <svg className="w-4 h-4" fill={chapterBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {chapterBookmarked ? '已收藏' : '收藏本章'}
              </button>

              {/* 语音朗读(无 speechSynthesis 时自动走服务端 TTS,微信内也能听) */}
              <button
                onClick={() => {
                  if (speech.state === 'playing') speech.pause();
                  else if (speech.state === 'paused') speech.resume();
                  else speech.start(startVerse ?? undefined);
                }}
                disabled={speech.ttsLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  speech.state !== 'idle'
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-ink-200 text-ink-700 hover:border-primary-400 hover:text-primary-600'
                } ${speech.ttsLoading ? 'opacity-60 cursor-wait' : ''}`}
                title={startVerse ? `从第 ${startVerse} 节开始朗读` : '从头朗读本章'}
              >
                {speech.ttsLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 109 9" /></svg>
                ) : speech.state === 'playing' ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
                )}
                {speech.ttsLoading
                  ? '合成中…'
                  : speech.state === 'playing'
                    ? '暂停朗读'
                    : speech.state === 'paused'
                      ? '继续朗读'
                      : startVerse
                        ? `从第 ${startVerse} 节朗读`
                        : '朗读本章'}
              </button>
              {speech.ttsMode === 'server' && !speech.ttsError && !speech.ttsLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink-100 border border-ink-200 text-xs text-ink-400">
                  🎧 语音朗读（微信内也能听）
                  {speech.ttsProvider === 'cache' ? '·已缓存' : speech.ttsProvider === 'baidu' ? '·百度' : speech.ttsProvider === 'edge' ? '·微软' : speech.ttsProvider === 'client' ? '·直连' : ''}
                </span>
              )}
              {speech.ttsMode === 'server' && speech.ttsLoading && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 border border-primary-100 text-xs text-primary-600">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 109 9" /></svg>
                  正在合成语音，首次约需 10 秒，请稍候…
                </span>
              )}
              {/* 服务端合成失败 → 浏览器直连兜底（请求走用户自身网络，通常不受机房 IP 风控影响） */}
              {speech.clientReady && (
                <button
                  type="button"
                  onClick={speech.clientPlay}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors"
                >
                  ▶ 点此播放（用你的网络直接合成）
                </button>
              )}
              {speech.ttsError && !speech.clientReady && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-500">
                  ⚠ 语音合成暂不可用，请稍后重试；也可改用 Chrome / Safari 的本地语音
                </span>
              )}

              {/* 轻提示：点击任意一节即可从那里开始朗读 */}
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50/80 border border-primary-100 text-xs text-primary-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                轻触任意一节，即从该节开始朗读
              </span>

              {/* 括号注释开关 */}
              {chapterHasNotes && (
                <label
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500 cursor-pointer"
                  title="经文中的括号多是译注/补注。勾选后阅读时隐藏，朗读时始终跳过。"
                >
                  <input
                    type="checkbox"
                    checked={skipNotes}
                    onChange={toggleSkipNotes}
                    className="accent-primary-600"
                  />
                  跳过括号注释
                </label>
              )}

              {/* 多译本对照：一键逐节对照另一译本 */}
              <label
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500 cursor-pointer"
                title="选择另一译本，逐节对照阅读"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h6M9 12h6M9 19h6M4 5h.01M4 12h.01M4 19h.01" /></svg>
                <span>对照</span>
                <select
                  value={cmpVersion}
                  onChange={(e) => changeCmpVersion(e.target.value)}
                  className="bg-transparent outline-none text-ink-600"
                >
                  <option value="">关闭</option>
                  {CMP_VERSIONS.filter((v) => v.id !== version).map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
                {cmpLoading && <span className="text-ink-400">…</span>}
              </label>
              {/* 朗读设置：是否播报章节 / 节号、语速、自动下一章 */}
              <>
                  <label
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500 cursor-pointer"
                    title={`朗读前先播报「${data?.book.name ?? ''} 第 ${chapter} 章」`}
                  >
                    <input
                      type="checkbox"
                      checked={announceChapter}
                      onChange={toggleAnnounceChapter}
                      className="accent-primary-600"
                    />
                    念书名章
                  </label>
                  <label
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500 cursor-pointer"
                    title="每节正文前播报「第 3 节」"
                  >
                    <input
                      type="checkbox"
                      checked={announceVerse}
                      onChange={toggleAnnounceVerse}
                      className="accent-primary-600"
                    />
                    念节号
                  </label>
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500">
                    语速
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={speech.rate}
                      onChange={(e) => speech.setRate(Number(e.target.value))}
                      className="w-20 accent-primary-600"
                    />
                    <span className="w-8 tabular-nums">{speech.rate.toFixed(1)}x</span>
                    <span
                      className="text-[11px] text-ink-400"
                      title="1.0x 时逐字高亮（读到哪个字亮哪个字）；其他倍速只高亮整节"
                    >
                      {speech.wordSync ? '逐字高亮' : '整节高亮'}
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-ink-200 text-xs text-ink-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoNextChapter}
                      onChange={(e) => setAutoNextChapter(e.target.checked)}
                      className="accent-primary-600"
                    />
                    读完自动下一章
                  </label>
                </>
              {speech.ttsMode === 'server' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink-100 border border-ink-200 text-xs text-ink-400">
                  服务端语音：设置更改后重新朗读生效
                </span>
              )}
              {speech.state !== 'idle' && (
                <button
                  onClick={speech.stop}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-white border-ink-200 text-ink-500 hover:text-rose-600 hover:border-rose-300 transition-colors"
                  title="停止朗读"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6V6z" /></svg>
                  停止
                </button>
              )}
              <button
                onClick={markRead}
                disabled={!user || readAction.pending}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  !user ? 'opacity-60 cursor-not-allowed bg-white border-ink-200 text-ink-700' : 'btn-primary'
                }`}
                title="标记为已读"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                标记已读
              </button>
              {bmError && <span className="text-rose-600 text-xs">书签加载：{bmError}</span>}
              {bookmarkAction.error && <span className="text-rose-600 text-xs">书签：{bookmarkAction.error}</span>}
              {readAction.error && <span className="text-rose-600 text-xs">已读：{readAction.error}</span>}
            </div>

            <article
              ref={articleRef}
              className={`${serifFont ? 'font-serif' : 'font-sans'} text-ink-800 ${FONT[fontSize]} ${LH[lineHeight]}`}
              style={{ fontFamily: serifFont ? '"Noto Serif SC","Songti SC","SimSun",Georgia,serif' : '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif' }}
            >
              {data.verses.map((v, i) => {
                const vb = verseBookmarks.has(v.verse);
                const speaking = speech.speakingKey === v.verse;
                const seg = speech.segments[v.verse];
                const toks = splitVerse(v.text || '');
                const firstTextTok = toks.findIndex((t) => !t.note);
                const isFirstVerse = i === 0;
                const targeted = startVerse === v.verse;
                // 全局字符游标：注释段不占索引（朗读时也不读），保证高亮与朗读对齐
                let raw = seg ? seg.start : 0;
                return (
                  <>
                  <p
                    key={v.verse}
                    id={`v${v.verse}`}
                    onClick={(e) => {
                      // 用户正在拖选文字复制时不触发朗读
                      if (typeof window !== 'undefined' && (window.getSelection()?.toString() || '').trim()) return;
                      startFrom(v.verse);
                    }}
                    className={`read-verse mb-5 group relative pl-10 pr-12 py-2 rounded-xl transition-all duration-200 scroll-mt-24 cursor-pointer ${
                      speaking
                        ? speech.wordSync
                          ? 'bg-amber-50/80 border-l-2 border-amber-400 shadow-sm'
                          : 'bg-amber-100/90 border-l-4 border-amber-500 shadow-sm'
                        : targeted
                          ? 'bg-primary-50/70 border-l-2 border-primary-400'
                          : 'hover:bg-ink-50/50'
                    }`}
                  >
                    {/* 节号：点击从本节开始朗读 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); startFrom(v.verse); }}
                      title="点击从本节开始朗读"
                      className={`absolute left-0 top-2 w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full transition-all duration-300 ${
                        speaking
                          ? 'bg-amber-500 text-white scale-110 shadow-md'
                          : targeted
                            ? 'bg-primary-600 text-white'
                            : 'text-amber-600/70 group-hover:text-amber-700 group-hover:bg-amber-100'
                      }`}
                    >
                      {v.verse}
                    </button>
                    
                    {/* 经文内容 */}
                    <span className={`block ${speaking ? 'text-amber-900' : ''} ${speaking && !speech.wordSync ? 'font-medium' : ''}`}>
                      {toks.map((t, ti) => {
                        if (t.note) {
                          if (skipNotes) return null;
                          return (
                            <span
                              key={ti}
                              className="text-ink-400 text-[0.8em] italic px-0.5"
                              title="译注（朗读时跳过）"
                            >
                              {t.text}
                            </span>
                          );
                        }
                        const cs = Array.from(t.text);
                        return (
                          <span key={ti}>
                            {cs.map((ch, j) => {
                              const r = raw++;
                              const dropCap = isFirstVerse && ti === firstTextTok && j === 0;
                              return dropCap ? (
                                <span
                                  key={j}
                                  className="float-left text-5xl font-bold text-amber-600 mr-2 mt-[-8px] leading-none"
                                >
                                  {ch}
                                </span>
                              ) : (
                                <span
                                  key={j}
                                  className="verse-char inline transition-all duration-150"
                                  data-raw={seg ? r : undefined}
                                >
                                  {ch}
                                </span>
                              );
                            })}
                          </span>
                        );
                      })}
                    </span>

                    {/* 对照译本：仅在开启对照且该节有译文时显示（英文自动用衬线体） */}
                    {cmpVersion && cmpVerses[v.verse] && (
                      <span className="block mt-1.5 text-[0.88em] leading-relaxed text-ink-500 border-l-2 border-primary-200 pl-2.5">
                        <span className="text-[0.9em] font-medium text-primary-500/80 mr-1.5">
                          {CMP_VERSIONS.find((x) => x.id === cmpVersion)?.label || cmpVersion}
                        </span>
                        <span className={cmpVersion === 'kjv' ? 'italic' : ''}>{cmpVerses[v.verse]}</span>
                      </span>
                    )}

                    {/* 收藏按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleVerseBookmark(v.verse); }}
                      disabled={!user || bookmarkAction.pending || bmLoading}
                      className={`absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 p-1.5 rounded-lg hover:bg-amber-100 ${
                        vb 
                          ? 'opacity-100 text-amber-500' 
                          : 'text-ink-300 hover:text-amber-500'
                      } ${!user ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={vb ? '取消本节书签' : '收藏本节'}
                    >
                      <svg className="w-4 h-4" fill={vb ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}                         d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.098 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    {/* 笔记按钮：点击展开内联编辑,与本节书签绑定保存 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cur = bmList?.items.find((b) => b.verse === v.verse)?.note || '';
                        setNoteDraft(cur);
                        setNoteEditing(noteEditing === v.verse ? null : v.verse);
                      }}
                      disabled={!user}
                      className={`absolute right-9 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 p-1.5 rounded-lg hover:bg-primary-100 ${
                        noteEditing === v.verse
                          ? 'opacity-100 text-primary-600'
                          : 'text-ink-300 hover:text-primary-600'
                      } ${!user ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title="写笔记"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </p>
                  {noteEditing === v.verse && (
                    <div className="mt-2 ml-10 mr-4" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={noteDraft}
                        autoFocus
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="写点笔记，与本节书签一起保存…"
                        className="input-styled w-full min-h-[72px] resize-y text-sm"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          disabled={bookmarkAction.pending}
                          onClick={() => saveNote(v.verse)}
                          className="btn-primary text-xs py-1.5 px-3"
                        >
                          {bookmarkAction.pending ? '保存中…' : '保存笔记'}
                        </button>
                        <button
                          onClick={() => { setNoteEditing(null); setNoteDraft(''); }}
                          className="btn-ghost text-xs py-1.5 px-3"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                );
              })}
              <style jsx>{`
                :global(.verse-char) {
                  transition: color 0.12s ease, transform 0.12s ease;
                  display: inline;
                }
                :global(.verse-char.read) {
                  color: #b45309;
                }
                :global(.verse-char.active) {
                  color: #d97706;
                  font-weight: 700;
                  transform: scale(1.12);
                  text-shadow: 0 0 8px rgba(217, 119, 6, 0.35);
                }
              `}</style>
            </article>

            {/* 操作栏 */}
            <div className="flex items-center justify-center gap-3 mt-10">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-ink-200 text-ink-700 hover:border-primary-400 hover:text-primary-600 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {copied ? '已复制' : '复制经文'}
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-ink-200 text-ink-700 hover:border-primary-400 hover:text-primary-600 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                分享
              </button>
            </div>
          </>
        )}

        {/* 上下章切换 */}
        <div className="flex items-center justify-between mt-10 pt-6 divider-gradient">
          <button
            onClick={() => prev && router.push(`/bible/${version}/${book}/${prev}`)}
            disabled={!prev}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              prev ? 'bg-white border border-ink-200 text-ink-700 hover:border-primary-400 hover:text-primary-600' : 'bg-ink-100 text-ink-300 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            上一章
          </button>
          <Link href={`/bible/${version}/${book}`} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            目录
          </Link>
          <button
            onClick={() => next && router.push(`/bible/${version}/${book}/${next}`)}
            disabled={!next}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              next ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl' : 'bg-ink-100 text-ink-300 cursor-not-allowed'
            }`}
          >
            下一章
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* 读经小天使：可拖动；朗读时指字/指行，未朗读时趴着休息 */}
      {data?.hasContent && (
        <ReadingAngel
          state={speech.state}
          speakingKey={speech.speakingKey}
          speakCharRef={speech.speakCharRef}
          wordSync={speech.wordSync}
        />
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-ink-900/90 text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* 分享弹窗：含「生成经文分享卡片图」 */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={data ? `${data.book.name} ${chapter}章` : undefined}
        text={data ? `来自圣约社区：${data.book.name} ${chapter}章` : undefined}
        card={shareCard}
      />
    </div>
  );
}
