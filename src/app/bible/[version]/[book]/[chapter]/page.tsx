'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPost, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSpeech, type SpeechItem } from '@/lib/useSpeech';

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
  sm: 'text-base sm:text-lg leading-loose',
  md: 'text-lg sm:text-xl leading-loose',
  lg: 'text-xl sm:text-2xl leading-loose',
};

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

  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [autoNextChapter, setAutoNextChapter] = useState(false);

  // 本章书签状态：0 表示整章收藏，>0 表示单节收藏
  const [chapterBookmarked, setChapterBookmarked] = useState(false);
  const [verseBookmarks, setVerseBookmarks] = useState<Set<number>>(new Set());

  const bmPath = user ? `/bible/bookmarks${qs({ book, chapter })}` : null;
  const { data: bmList, loading: bmLoading, error: bmError } = useApi<BookmarkResp>(
    bmPath,
    [user, book, chapter]
  );
  const bookmarkAction = useAction();
  const readAction = useAction();

  // 语音朗读：逐节朗读，读到哪节就高亮哪节
  const speechItems = useMemo<SpeechItem[]>(
    () => (data?.verses ?? []).map((v) => ({ key: v.verse, text: v.text })),
    [data?.verses]
  );
  const speech = useSpeech(speechItems, 'zh-CN');
  const articleRef = useRef<HTMLDivElement>(null);

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

  // 朗读读完最后一节 → 自动进入下一章并继续朗读
  const lastKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (speech.speakingKey != null) lastKeyRef.current = speech.speakingKey;
  }, [speech.speakingKey]);
  useEffect(() => {
    if (!autoNextChapter) return;
    if (speech.state !== 'idle' || speech.speakingKey != null) return;
    const last = lastKeyRef.current;
    if (last == null) return;
    const maxVerse = data?.verses?.length ? data.verses[data.verses.length - 1].verse : 0;
    if (last !== maxVerse) return;
    lastKeyRef.current = null;
    if (next) {
      router.push(`/bible/${version}/${book}/${next}?autoread=1`);
    } else {
      setAutoNextChapter(false);
      showToast('已读到本卷最后一章');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.state, speech.speakingKey]);

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
    if (speech.speakingKey == null) {
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
  }, [speech.speakingKey]);

  // 由上一章自动连播跳转而来时，内容就绪后自动开读
  const autoReadDone = useRef(false);
  useEffect(() => {
    if (searchParams.get('autoread') !== '1') return;
    if (!data?.hasContent || !speech.supported) return;
    if (autoReadDone.current) return;
    autoReadDone.current = true;
    setAutoNextChapter(true);
    const t = setTimeout(() => speech.start(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasContent, data?.chapter]);

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

  const handleShare = async () => {
    const text = buildText();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${data?.book.name} ${chapter}章`, text });
        return;
      } catch {
        /* 用户取消则回退到复制 */
      }
    }
    handleCopy();
  };

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
    <div className="min-h-screen bg-ink-50/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/bible/${version}`}
            className="inline-flex items-center gap-1 text-ink-500 hover:text-primary-600 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {version}
          </Link>

          {/* 字号调节 */}
          <div className="flex items-center gap-1 bg-white rounded-full p-1 shadow-soft border border-ink-100">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  fontSize === size ? 'bg-primary-600 text-white' : 'text-ink-500 hover:text-primary-600'
                }`}
              >
                {size === 'sm' ? '小' : size === 'md' ? '中' : '大'}
              </button>
            ))}
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

              {/* 语音朗读 */}
              {speech.supported && (
                <button
                  onClick={() => {
                    if (speech.state === 'playing') speech.pause();
                    else if (speech.state === 'paused') speech.resume();
                    else speech.start();
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    speech.state !== 'idle'
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white border-ink-200 text-ink-700 hover:border-primary-400 hover:text-primary-600'
                  }`}
                  title="语音朗读本章"
                >
                  {speech.state === 'playing' ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
                  )}
                  {speech.state === 'playing' ? '暂停朗读' : speech.state === 'paused' ? '继续朗读' : '朗读本章'}
                </button>
              )}
              {speech.state !== 'idle' && (
                <>
                  <button
                    onClick={speech.stop}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-white border-ink-200 text-ink-500 hover:text-rose-600 hover:border-rose-300 transition-colors"
                    title="停止朗读"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6V6z" /></svg>
                    停止
                  </button>
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

            <article className={`font-serif text-ink-800 ${FONT[fontSize]} leading-relaxed`} style={{ fontFamily: '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif' }}>
              {data.verses.map((v, i) => {
                const vb = verseBookmarks.has(v.verse);
                const speaking = speech.speakingKey === v.verse;
                const seg = speech.segments[v.verse];
                const chars = Array.from((v.text || '').trim());
                const isFirstVerse = i === 0;
                return (
                  <p
                    key={v.verse}
                    id={`v${v.verse}`}
                    className={`mb-5 group relative pl-10 pr-12 py-2 rounded-xl transition-all duration-200 ${
                      speaking 
                        ? 'bg-amber-50/80 border-l-2 border-amber-400 shadow-sm' 
                        : isFirstVerse 
                          ? 'first-line:bg-gradient-to-r first-line:from-amber-50/30 first-line:to-transparent' 
                          : 'hover:bg-ink-50/50'
                    }`}
                  >
                    {/* 节号 - 装饰性样式 */}
                    <span className={`absolute left-0 top-2 w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full transition-all duration-300 ${
                      speaking 
                        ? 'bg-amber-500 text-white scale-110 shadow-md' 
                        : 'text-amber-600/70 group-hover:text-amber-600 group-hover:bg-amber-100'
                    }`}>
                      {v.verse}
                    </span>
                    
                    {/* 经文内容 */}
                    <span className={`block leading-loose ${speaking ? 'text-amber-900' : ''}`}>
                      {isFirstVerse && (
                        <span className="float-left text-5xl font-bold text-amber-600 mr-2 mt-[-8px] font-serif leading-none">
                          {chars[0]}
                        </span>
                      )}
                      {chars.slice(isFirstVerse ? 1 : 0).map((ch, j) => (
                        <span 
                          key={j} 
                          className={`verse-char inline transition-all duration-150 ${
                            seg ? 'hover:text-amber-700' : ''
                          }`}
                          data-raw={seg ? seg.start + j : undefined}
                        >
                          {ch}
                        </span>
                      ))}
                    </span>
                    
                    {/* 收藏按钮 */}
                    <button
                      onClick={() => toggleVerseBookmark(v.verse)}
                      disabled={!user || bookmarkAction.pending || bmLoading}
                      className={`absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 p-1.5 rounded-lg hover:bg-amber-100 ${
                        vb 
                          ? 'opacity-100 text-amber-500' 
                          : 'text-ink-300 hover:text-amber-500'
                      } ${!user ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={vb ? '取消本节书签' : '收藏本节'}
                    >
                      <svg className="w-4 h-4" fill={vb ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.098 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.519-4.674z" />
                      </svg>
                    </button>
                  </p>
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

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-ink-900/90 text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
