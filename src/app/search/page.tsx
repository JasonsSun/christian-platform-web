'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ContentItem, SongItem, ActivityItem, GroupItem } from '@/lib/types';

type SearchUser = { id: string; username: string; displayName: string; avatarColor: string; city: string; church: string };
type VerseHit = { bookId: string; bookName: string; chapter: number; verse: number; text: string };
type SearchResp = {
  keyword: string;
  contents: ContentItem[];
  songs: SongItem[];
  activities: ActivityItem[];
  groups: GroupItem[];
  verses: VerseHit[];
  users: SearchUser[];
};

const HISTORY_KEY = 'search_history';
const HOT_SEARCHES = ['约翰福音', '赞美诗', '青年团契', '主日崇拜', '马太福音', '祷告', '复活节', '诗篇'];

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveHistory(term: string) {
  try {
    const cur = loadHistory();
    const next = [term, ...cur.filter((t) => t !== term)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

function SectionTitle({ icon, title, total, href }: { icon: string; title: string; total: number; href: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-display text-lg md:text-xl font-bold text-ink-900 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="text-sm font-normal text-ink-400">({total})</span>
      </h2>
      <Link href={href} className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
        查看全部
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </Link>
    </div>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // 当 URL 中的 q 变化时，同步输入框并记录历史
  useEffect(() => {
    setInput(q);
    if (q) {
      saveHistory(q);
      setHistory(loadHistory());
    }
  }, [q]);

  const path = q ? '/search' + qs({ q }) : null;
  const { data, loading, error } = useApi<SearchResp>(path, [q]);

  const submit = (term: string) => {
    const t = term.trim();
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  const enc = encodeURIComponent(q);

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 搜索框 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="relative mb-8"
      >
        <div className="glass rounded-2xl p-1.5 shadow-card-hover">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-ink-400 ml-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜索经文、诗歌、活动、团契或弟兄姊妹..."
              className="flex-1 py-3.5 bg-transparent text-ink-900 placeholder:text-ink-400 text-base focus:outline-none"
              autoFocus
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="text-ink-400 hover:text-ink-600 p-1"
                aria-label="清除"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
            <button type="submit" className="btn-primary py-2.5 px-5 text-sm flex-shrink-0">搜索</button>
          </div>
        </div>
      </form>

      {/* 无搜索词：展示历史与热门 */}
      {!q && (
        <div className="space-y-8">
          {history.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-soft border border-ink-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span>🕐</span>搜索历史
                </h3>
                <button onClick={handleClearHistory} className="text-sm text-ink-400 hover:text-rose-500 transition-colors">
                  清空
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((h) => (
                  <button
                    key={h}
                    onClick={() => submit(h)}
                    className="px-4 py-2 rounded-xl bg-ink-50 hover:bg-primary-50 text-ink-700 hover:text-primary-700 text-sm transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-soft border border-ink-100">
            <h3 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2 mb-4">
              <span>🔥</span>热门搜索
            </h3>
            <div className="flex flex-wrap gap-2">
              {HOT_SEARCHES.map((h, i) => (
                <button
                  key={h}
                  onClick={() => submit(h)}
                  className={`px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1.5 ${
                    i < 3
                      ? 'bg-gold-50 text-gold-700 hover:bg-gold-100'
                      : 'bg-ink-50 text-ink-700 hover:bg-primary-50 hover:text-primary-700'
                  }`}
                >
                  {i < 3 && <span className="font-bold">{i + 1}</span>}
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary-50 to-gold-50 rounded-2xl p-8 text-center border border-ink-100">
            <div className="text-5xl mb-3">🔍</div>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-2">全站搜索</h2>
            <p className="text-ink-500">输入关键词，在圣经、诗歌、内容、活动、团契与用户中探索属灵资源</p>
          </div>
        </div>
      )}

      {q && error && <p className="text-rose-600 text-sm mb-6">搜索失败：{error}</p>}

      {q && loading && (
        <div className="space-y-6 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-ink-100 rounded-2xl" />
          ))}
        </div>
      )}

      {q && !loading && data && (
        <div className="space-y-10">
          {/* 经文 */}
          {data.verses.length > 0 && (
            <section>
              <SectionTitle icon="📖" title="经文" total={data.verses.length} href={`/bible?q=${enc}`} />
              <div className="space-y-3">
                {data.verses.slice(0, 6).map((v, i) => (
                  <Link key={i} href={`/bible/cuv/${v.bookId}/${v.chapter}`} className="block bg-white rounded-2xl p-5 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all">
                    <div className="text-sm font-semibold text-primary-700 mb-1">{v.bookName} {v.chapter}:{v.verse}</div>
                    <p className="text-ink-700 font-serif leading-relaxed line-clamp-2">{v.text}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 诗歌 */}
          {data.songs.length > 0 && (
            <section>
              <SectionTitle icon="🎵" title="诗歌" total={data.songs.length} href={`/songs?q=${enc}`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.songs.slice(0, 6).map((s) => (
                  <Link key={s.id} href={`/songs/${s.id}`} className="group bg-white rounded-2xl p-4 shadow-soft border border-ink-100 hover:border-gold-200 hover:shadow-card-hover transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 flex items-center justify-center text-gold-700 text-lg flex-shrink-0">♪</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-ink-900 truncate group-hover:text-gold-600">{s.title}</h4>
                      <p className="text-xs text-ink-500 truncate">{s.author}{s.category ? ` · ${s.category}` : ''}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 内容 */}
          {data.contents.length > 0 && (
            <section>
              <SectionTitle icon="✨" title="内容" total={data.contents.length} href={`/community?q=${enc}`} />
              <div className="space-y-3">
                {data.contents.slice(0, 6).map((c) => (
                  <Link key={c.id} href={`/community/${c.id}`} className="flex gap-4 bg-white rounded-2xl p-4 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all">
                    <div className="w-16 h-16 rounded-xl flex-shrink-0 bg-gradient-to-br from-primary-500 to-primary-700" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-ink-900 truncate">{c.title}</h4>
                      <p className="text-sm text-ink-500 line-clamp-2 mt-1">{c.excerpt}</p>
                      <p className="text-xs text-ink-400 mt-1">{c.author.displayName} · {formatDate(c.createdAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 活动 */}
          {data.activities.length > 0 && (
            <section>
              <SectionTitle icon="📅" title="活动" total={data.activities.length} href={`/activities?q=${enc}`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.activities.slice(0, 6).map((a) => (
                  <Link key={a.id} href={`/activities/${a.id}`} className="bg-white rounded-2xl p-4 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all">
                    <h4 className="font-semibold text-ink-900 truncate">{a.title}</h4>
                    <p className="text-xs text-ink-500 mt-1">{a.category} · {a.city || a.location}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 团契 */}
          {data.groups.length > 0 && (
            <section>
              <SectionTitle icon="🤝" title="团契" total={data.groups.length} href={`/groups?q=${enc}`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.groups.slice(0, 6).map((g) => (
                  <Link key={g.id} href={`/groups/${g.id}`} className="bg-white rounded-2xl p-4 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all">
                    <h4 className="font-semibold text-ink-900 truncate">{g.name}</h4>
                    <p className="text-xs text-ink-500 mt-1">{g.category} · {g.memberCount} 位成员</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 用户 */}
          {data.users.length > 0 && (
            <section>
              <SectionTitle icon="👤" title="用户" total={data.users.length} href={`/friends?q=${enc}`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.users.slice(0, 6).map((u) => (
                  <Link key={u.id} href={`/me/${u.id}`} className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-soft border border-ink-100 hover:border-primary-200 hover:shadow-card-hover transition-all">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: u.avatarColor }}>
                      {u.displayName.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-ink-900 truncate">{u.displayName}</h4>
                      <p className="text-xs text-ink-500 truncate">{u.church || u.city || u.username}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 空态 */}
          {data.contents.length === 0 && data.songs.length === 0 && data.activities.length === 0 &&
            data.groups.length === 0 && data.verses.length === 0 && data.users.length === 0 && (
              <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
                <div className="text-5xl mb-4">📭</div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2">没有找到「{q}」</h3>
                <p className="text-ink-500 mb-6">换个关键词试试，或浏览下方的热门搜索</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {HOT_SEARCHES.slice(0, 4).map((h) => (
                    <button
                      key={h}
                      onClick={() => submit(h)}
                      className="px-4 py-2 rounded-xl bg-ink-50 hover:bg-primary-50 text-ink-700 hover:text-primary-700 text-sm transition-colors"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-400">加载中...</div>}>
      <SearchInner />
    </Suspense>
  );
}
