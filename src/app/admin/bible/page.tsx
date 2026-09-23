'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPatch, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { versionLabel } from '@/lib/bibleMeta';
import { canEnterAdmin, AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox, PageHead, Toolbar, AccessState } from '../_components';

/* ----------------------------- 类型 ----------------------------- */

interface VersionRow { version: string; verseCount: number; bookCount: number; chapterCount: number }
interface BookRow {
  bookId: string; version: string; verseCount: number; maxChapter: number;
  chapters: number[]; stdChapters: number | null; missing: number | null;
}
interface BibleData {
  totals: { versions: number; books: number; verses: number };
  byVersion: VersionRow[];
  byBook: BookRow[];
  issues: { emptyText: number; longText: number };
}
interface BibleMeta {
  versions: { id: string; label: string }[];
  books: { id: string; dbId: string; name: string; abbr: string; chapters: number; testament: 'old' | 'new' }[];
}
interface ChapterResp {
  version: string;
  book: { id: string; name: string; abbr: string; chapters: number; testament: 'old' | 'new' };
  chapter: number;
  verses: { verse: number; text: string }[];
  availableChapters: number[];
  hasContent: boolean;
}

const SELECT_CLS =
  'rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-primary-200';

export default function AdminBiblePage() {
  const { user, loading: authLoading } = useAuth();
  // /admin/bible 要 admin 或 moderator；/bible 是公开经文元数据，照旧匿名可取。
  const canSee = canEnterAdmin(user, '/admin/bible');
  const canEdit = user?.role === 'admin';

  const meta = useApi<BibleMeta>('/bible', []);
  const admin = useApi<BibleData>(canSee ? '/admin/bible' : null, [canSee]);

  const [version, setVersion] = useState('cuv');
  const [bookId, setBookId] = useState('genesis');
  const [chapter, setChapter] = useState(1);
  const [bookQuery, setBookQuery] = useState('');
  const [editing, setEditing] = useState<{ verse: number; text: string } | null>(null);
  const action = useAction();

  const books = meta.data?.books || [];
  const dbIdOf = useMemo(() => new Map(books.map((b) => [b.id, b.dbId])), [books]);
  const bookOfDbId = useMemo(() => new Map(books.map((b) => [b.dbId, b])), [books]);
  const orderOfDbId = useMemo(() => new Map(books.map((b, i) => [b.dbId, i])), [books]);

  const bookDbId = dbIdOf.get(bookId) || '';

  // 章节数据（复用前台接口，自带 1h 内存缓存）
  const ch = useApi<ChapterResp>(
    `/bible/chapter${qs({ version, book: bookId, chapter })}`,
    [version, bookId, chapter]
  );

  // 当前版本的书卷清单（支持搜索）
  const versionBooks = useMemo(() => {
    const rows = (admin.data?.byBook || []).filter((b) => b.version === version);
    const s = bookQuery.trim().toLowerCase();
    const filtered = s
      ? rows.filter((r) => {
          const m = bookOfDbId.get(r.bookId);
          return (m?.name || '').toLowerCase().includes(s)
            || (m?.abbr || '').toLowerCase().includes(s)
            || r.bookId.toLowerCase().includes(s);
        })
      : rows;
    return [...filtered].sort(
      (a, b) => (orderOfDbId.get(a.bookId) ?? 9e9) - (orderOfDbId.get(b.bookId) ?? 9e9)
    );
  }, [admin.data, version, bookQuery, bookOfDbId, orderOfDbId]);

  // 数据体检（缺章 / 空文本 / 超长文本）
  const health = useMemo(() => {
    const rows = admin.data?.byBook || [];
    const missing = rows.filter((r) => (r.missing ?? 0) > 0);
    return {
      missingBooks: missing,
      missingChapters: missing.reduce((s, r) => s + (r.missing || 0), 0),
      emptyText: admin.data?.issues?.emptyText || 0,
      longText: admin.data?.issues?.longText || 0,
    };
  }, [admin.data]);

  const availChapters = ch.data?.availableChapters || [];
  const idx = availChapters.indexOf(chapter);
  const prev = idx > 0 ? availChapters[idx - 1] : null;
  const next = idx >= 0 && idx < availChapters.length - 1 ? availChapters[idx + 1] : null;

  // 切换版本/书卷/章时退出编辑态
  useEffect(() => { setEditing(null); }, [version, bookId, chapter]);

  function pickBook(dbId: string) {
    const m = bookOfDbId.get(dbId);
    if (m) setBookId(m.id);
    setChapter(1);
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    await action.run(async () => {
      await apiPatch('/admin/bible/verse', {
        version, book: bookDbId, chapter, verse: editing.verse, text,
      });
      setEditing(null);
      ch.reload();
      admin.reload();
    });
  }

  const problemCount = health.emptyText + health.longText + health.missingBooks.length;

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="圣经管理只对管理员开放，请先用管理员账号登录。" href="/login?next=/admin/bible" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要管理员账号，才能查看经文收录完整度与修订经文。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="内容 · 圣经"
        title="圣经管理"
        sub="核对译本收录完整度 · 按卷查阅经文 · 修订录入错误"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="版本数" value={admin.data?.totals.versions ?? '—'} />
        <StatCard title="书卷数" value={admin.data?.totals.books ?? '—'} />
        <StatCard title="经文总数" value={admin.data?.totals.verses ?? '—'} />
        <StatCard
          title="完整性"
          value={problemCount === 0 ? '正常' : `${problemCount} 处`}
          hint={problemCount === 0 ? '无缺章 / 空文本' : '见下方数据体检'}
        />
      </div>

      {admin.loading && !admin.data ? (
        <Loading />
      ) : admin.error ? (
        <ErrorBox message={admin.error} onRetry={admin.reload} />
      ) : (
        <div className="space-y-6">
          {/* 数据体检 */}
          <div className="glass rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-ink-700">数据体检</div>
              {problemCount === 0
                ? <Badge tone="green">全部通过</Badge>
                : <Badge tone="gold">{problemCount} 处待查</Badge>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="缺章书卷" value={health.missingBooks.length} bad={health.missingBooks.length > 0} />
              <Metric label="缺失章节数" value={health.missingChapters} bad={health.missingChapters > 0} />
              <Metric label="空/极短经文" value={health.emptyText} bad={health.emptyText > 0} />
              <Metric label="超长经文" value={health.longText} bad={health.longText > 0} />
            </div>
            {health.missingBooks.length > 0 && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl p-3 leading-relaxed">
                收录不完整：
                {health.missingBooks.slice(0, 12).map((b) => {
                  const m = bookOfDbId.get(b.bookId);
                  return `${m?.name || b.bookId}(${b.version.toUpperCase()})缺${b.missing}章`;
                }).join('、')}
                {health.missingBooks.length > 12 ? ` 等 ${health.missingBooks.length} 卷` : ''}
              </div>
            )}
          </div>

          {/* 版本概览：可点选 */}
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">
              版本概览
              <span className="ml-2 text-xs text-ink-400 font-normal">点击切换下方书卷与经文</span>
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">圣经管理</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">版本</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">书卷</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">章节</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">经文</th>
                </tr>
              </thead>
              <tbody>
                {(admin.data?.byVersion || []).map((v) => {
                  const on = v.version === version;
                  return (
                    <tr
                      key={v.version}
                      className={`border-t border-ink-100 transition ${on ? 'bg-primary-50' : 'hover:bg-ink-50'}`}
                    >
                      <td className="px-4 py-3">
                        {/* 切换入口必须是真按钮：整行的 onClick 键盘拿不到（且会被按钮冒泡重复触发） */}
                        <button
                          type="button"
                          onClick={() => { setVersion(v.version); setChapter(1); }}
                          aria-pressed={on}
                          className="cursor-pointer"
                        >
                          <Badge tone={on ? 'primary' : 'gray'}>{v.version.toUpperCase()}</Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">{v.bookCount}</td>
                      <td className="px-4 py-3 text-center">{v.chapterCount}</td>
                      <td className="px-4 py-3 text-center font-medium text-ink-900">{v.verseCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 书卷清单 + 经文浏览器 */}
          <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
            <div className="glass rounded-2xl overflow-hidden shadow-soft">
              <div className="px-4 py-3 border-b border-ink-100">
                <div className="font-medium text-ink-700 mb-2">
                  书卷清单
                  <span className="ml-2 text-xs text-ink-400 font-normal">
                    {version.toUpperCase()} · {versionBooks.length} 卷
                  </span>
                </div>
                <input
                  aria-label="在当前译本中搜索书卷"
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                  placeholder="搜索书卷…"
                  className={`${SELECT_CLS} w-full`}
                />
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {versionBooks.length === 0 ? (
                  <Empty label="无匹配书卷" />
                ) : (
                  <ul className="text-sm">
                    {versionBooks.map((b) => {
                      const m = bookOfDbId.get(b.bookId);
                      const on = m?.id === bookId;
                      return (
                        <li key={b.bookId}>
                          <button
                            onClick={() => pickBook(b.bookId)}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition ${
                              on ? 'bg-primary-50 text-primary-700' : 'hover:bg-ink-50 text-ink-700'
                            }`}
                          >
                            <span className="truncate">
                              {m?.name || b.bookId}
                              {m?.abbr ? <span className="ml-1.5 text-xs text-ink-400">{m.abbr}</span> : null}
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-ink-400">{b.verseCount}节</span>
                              {(b.missing ?? 0) > 0
                                ? <Badge tone="red">缺{b.missing}</Badge>
                                : <Badge tone="green">全</Badge>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* 经文浏览器（替换旧「经文预览」） */}
            <div className="glass rounded-2xl overflow-hidden shadow-soft">
              <div className="px-4 py-3 border-b border-ink-100 flex flex-wrap items-center gap-2">
                <select
                  aria-label="选择圣经译本"
                  value={version}
                  onChange={(e) => { setVersion(e.target.value); setChapter(1); }}
                  className={SELECT_CLS}
                >
                  {/* 这一页其他地方（版本概览的徽章、书卷清单副标题）用的都是 CUV 这个库里的键，
                      下拉只写中文会让「和合本」和「CUV」看着像两回事。 */}
                  {(admin.data?.byVersion || []).map((v) => (
                    <option key={v.version} value={v.version}>
                      {versionLabel(v.version)}（{v.version.toUpperCase()}）
                    </option>
                  ))}
                </select>
                <select
                  aria-label="选择书卷"
                  value={bookId}
                  onChange={(e) => { setBookId(e.target.value); setChapter(1); }}
                  className={SELECT_CLS}
                >
                  {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select
                  aria-label="选择章数"
                  value={chapter}
                  onChange={(e) => setChapter(Number(e.target.value))}
                  className={SELECT_CLS}
                >
                  {(availChapters.length ? availChapters : [chapter]).map((c) => (
                    <option key={c} value={c}>第 {c} 章</option>
                  ))}
                </select>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    disabled={prev == null}
                    onClick={() => prev != null && setChapter(prev)}
                    className="btn-secondary btn-sm px-3 text-sm disabled:opacity-40"
                  >上一章</button>
                  <button
                    disabled={next == null}
                    onClick={() => next != null && setChapter(next)}
                    className="btn-secondary btn-sm px-3 text-sm disabled:opacity-40"
                  >下一章</button>
                  <Link
                    href={`/bible/${version}/${bookId}/${chapter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary btn-sm px-3 text-sm"
                  >前台查看 ↗</Link>
                </div>
              </div>

              <div className="p-4">
                {ch.loading ? (
                  <Loading />
                ) : ch.error ? (
                  <ErrorBox message={ch.error} onRetry={ch.reload} />
                ) : !ch.data?.hasContent ? (
                  <Empty label="该章暂无经文" />
                ) : (
                  <>
                    <div className="mb-3 text-sm text-ink-500">
                      {ch.data.book.name} 第 {ch.data.chapter} 章
                      <span className="ml-2 text-xs">{ch.data.verses.length} 节 · {version.toUpperCase()}</span>
                      {canEdit ? <span className="ml-2 text-xs text-primary-600">（悬停经文点「修订」可改）</span> : null}
                    </div>
                    {action.error && (
                      <div className="mb-3 text-sm text-rose-700 bg-rose-50 rounded-xl p-3">{action.error}</div>
                    )}
                    <ol className="space-y-1.5">
                      {ch.data.verses.map((v) => {
                        const isEditing = editing?.verse === v.verse;
                        return (
                          <li key={v.verse} className="group flex gap-3 rounded-xl px-2 py-1.5 hover:bg-ink-50">
                            <span className="text-xs text-primary-600 font-medium pt-1 w-6 text-right flex-shrink-0">
                              {v.verse}
                            </span>
                            {isEditing ? (
                              <div className="flex-1">
                                <textarea
                                  aria-label={`修订 ${ch.data.book.name} 第 ${ch.data.chapter} 章 第 ${v.verse} 节经文`}
                                  value={editing.text}
                                  onChange={(e) => setEditing({ verse: v.verse, text: e.target.value })}
                                  rows={3}
                                  className="w-full rounded-xl border border-primary-200 p-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-200"
                                />
                                <div className="mt-2 flex gap-2">
                                  <button
                                    onClick={saveEdit}
                                    disabled={action.pending}
                                    className="btn-primary btn-sm px-3 text-sm disabled:opacity-50"
                                  >{action.pending ? '保存中…' : '保存'}</button>
                                  <button
                                    onClick={() => { setEditing(null); action.setError(null); }}
                                    className="btn-secondary btn-sm px-3 text-sm"
                                  >取消</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="flex-1 text-sm leading-relaxed text-ink-700">{v.text}</span>
                                {canEdit ? (
                                  <button
                                    onClick={() => { action.setError(null); setEditing({ verse: v.verse, text: v.text }); }}
                                    className="opacity-0 max-md:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 text-xs text-primary-600 hover:underline flex-shrink-0 pt-1 px-2.5 -mx-2.5"
                                  >修订</button>
                                ) : null}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Metric({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${bad ? 'bg-rose-50' : 'bg-ink-50'}`}>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`font-display text-xl font-bold ${bad ? 'text-rose-700' : 'text-ink-900'}`}>{value}</div>
    </div>
  );
}
