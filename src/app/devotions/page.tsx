'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { apiPost, apiPatch, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { downloadText, safeFilename } from '@/lib/download';
import { IconBookOpen, IconClose, IconPencil, IconPlus } from '@/components/icons';

type Devotional = {
  id: string;
  title: string;
  body: string;
  ref: string;
  mood: string;
  createdAt: string;
  updatedAt: string;
};
type Stats = { total: number; thisMonth: number; firstAt: string | null; streakDays: number };
type Resp = {
  items: Devotional[];
  total: number;
  months: { month: string; count: number }[];
  stats: Stats;
  moods: string[];
};

type Draft = { id?: string; title: string; ref: string; mood: string; body: string };

const EMPTY_DRAFT: Draft = { title: '', ref: '', mood: '', body: '' };

/** 2026-09-15T01:02:03Z -> 09-15 01:02（本地时区） */
function fmt(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 2026-09 -> 2026 年 9 月 */
function fmtMonth(m: string): string {
  const [y, mm] = (m || '').split('-');
  if (!y || !mm) return m;
  return `${y} 年 ${Number(mm)} 月`;
}

export default function DevotionsPage() {
  const { user, loading: authLoading } = useAuth();
  const notice = useNotice();
  const confirmNav = useConfirmNav();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [version, setVersion] = useState(0);

  const path = user
    ? '/me/devotionals' + qs({ q: q || undefined, month: month || undefined, page: 1, pageSize: 50 })
    : null;
  const { data, loading, error } = useApi<Resp>(path, [user?.id, q, month, version]);
  const moods = data?.moods ?? [];
  const stats = data?.stats;
  const items = data?.items ?? [];

  // 搜索框防抖
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const grouped = useMemo(() => {
    const map = new Map<string, Devotional[]>();
    for (const it of items) {
      const key = (it.createdAt || '').slice(0, 7) || '未知';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const save = async () => {
    if (!draft) return;
    const body = draft.body.trim();
    if (!body) {
      notice.error('灵修日记内容不能为空');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: draft.title.trim(),
        ref: draft.ref.trim(),
        mood: draft.mood,
        body,
      };
      if (draft.id) await apiPatch(`/me/devotionals/${draft.id}`, payload);
      else await apiPost('/me/devotionals', payload);
      notice.success(draft.id ? '已保存修改' : '已记下这一篇灵修');
      setDraft(null);
      setVersion((v) => v + 1);
    } catch (e: any) {
      notice.error(e?.message || '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (it: Devotional) => {
    const label = it.title?.trim() || it.body.slice(0, 20);
    confirmNav({
      title: '删除这篇灵修日记？',
      desc: `「${label}」删除后无法恢复。`,
      danger: true,
      confirmText: '删除',
      action: 'devotional.delete',
      params: { id: it.id },
      onConfirm: () => {
        setVersion((v) => v + 1);
      },
    });
  };

  const exportMarkdown = () => {
    if (!items.length) return;
    const lines: string[] = [];
    lines.push('# 我的灵修日记');
    lines.push('');
    lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}`);
    lines.push(`> 共 ${items.length} 篇`);
    lines.push('');
    for (const [m, list] of grouped) {
      lines.push(`## ${fmtMonth(m)}`);
      lines.push('');
      for (const it of list) {
        const head = it.title?.trim() || '无标题';
        lines.push(`### ${head}（${fmt(it.createdAt)}）`);
        if (it.ref) lines.push('');
        if (it.ref) lines.push(`*经文：${it.ref}*`);
        if (it.mood) lines.push('');
        if (it.mood) lines.push(`*心情：${it.mood}*`);
        lines.push('');
        lines.push(it.body);
        lines.push('');
      }
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`${safeFilename('灵修日记')}-${date}.md`, lines.join('\n'));
  };

  const authed = !!user;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-gold-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* 头部 */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-ink-900 flex items-center gap-2">
              <IconBookOpen className="w-6 h-6 md:w-7 md:h-7 text-primary-500" strokeWidth={1.6} />
              灵修日记
            </h1>
            <p className="text-sm text-ink-500 mt-1">安静默想，把领受写下来。仅自己可见。</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {authed && items.length > 0 && (
              <button
                onClick={exportMarkdown}
                title="把日记导出为 Markdown 文件"
                className="px-3 py-2 rounded-xl text-sm font-medium text-ink-600 bg-white border border-ink-200 hover:border-primary-300 hover:text-primary-700 transition-colors"
              >
                导出
              </button>
            )}
            <Link
              href="/bible/notes"
              className="px-3 py-2 rounded-xl text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
            >
              我的笔记
            </Link>
          </div>
        </div>

        {!authed && !authLoading ? (
          <div className="glass rounded-2xl p-10 text-center shadow-card border border-white/40">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-600 flex items-center justify-center">
              <IconBookOpen className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900 mb-2">灵修日记是你的私人空间</h2>
            <p className="text-ink-500 text-sm mb-5">登录后即可记录每日灵修默想，跨设备同步，仅你自己可见。</p>
            <Link
              href="/login"
              className="inline-block px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-700 shadow-glow"
            >
              去登录
            </Link>
          </div>
        ) : (
          <>
            {/* 统计：登录态解析中 data 仍为空，这里必须一起占位，否则数据到达时整页往下顶 104px */}
            {(stats || !data) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {stats ? (
                  [
                    { label: '累计篇数', value: stats.total, unit: '篇' },
                    { label: '本月', value: stats.thisMonth, unit: '篇' },
                    { label: '连续记录', value: stats.streakDays, unit: '天' },
                    { label: '开始于', value: stats.firstAt ? fmt(stats.firstAt).slice(0, 5) : '—', unit: '' },
                  ].map((t, i) => (
                    <div key={i} className="glass rounded-2xl p-4 shadow-card border border-white/40">
                      <p className="text-xs text-ink-500">{t.label}</p>
                      <p className="font-display text-xl font-bold text-ink-900 mt-0.5">
                        {t.value}
                        {t.unit && <span className="text-xs font-normal text-ink-500 ml-1">{t.unit}</span>}
                      </p>
                    </div>
                  ))
                ) : (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl bg-ink-100 animate-pulse" aria-hidden />
                  ))
                )}
              </div>
            )}

            {/* 新建入口 / 编辑面板 */}
            {draft ? (
              <div className="glass rounded-2xl p-5 shadow-card border border-primary-200 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-bold text-ink-900">
                    {draft.id ? '编辑这篇灵修' : '记一篇灵修'}
                  </h2>
                  <button
                    onClick={() => setDraft(null)}
                    className="text-sm text-ink-400 hover:text-ink-600"
                  >
                    取消
                  </button>
                </div>

                <div className="space-y-3">
                  <input
                    name="title"
                    aria-label="灵修标题"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="标题（可留空）"
                    maxLength={120}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                  <input
                    name="ref"
                    aria-label="关联经文"
                    value={draft.ref}
                    onChange={(e) => setDraft({ ...draft, ref: e.target.value })}
                    placeholder="关联经文，如「诗篇 23:1-6」（可留空）"
                    maxLength={120}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />

                  <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="devotion-mood-label">
                    <span id="devotion-mood-label" className="text-xs text-ink-400">心情</span>
                    {moods.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft({ ...draft, mood: draft.mood === m ? '' : m })}
                        aria-pressed={draft.mood === m}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                          draft.mood === m
                            ? 'bg-gradient-to-r from-primary-500 to-primary-700 text-white border-transparent'
                            : 'bg-white text-ink-600 border-ink-200 hover:border-primary-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <textarea
                    name="body"
                    aria-label="灵修内容"
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    placeholder="今天神藉着经文对我说了什么？我如何回应？"
                    rows={7}
                    maxLength={5000}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-ink-200 text-ink-800 leading-relaxed placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-y font-serif"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-400">{draft.body.length} / 5000</span>
                    <button
                      onClick={save}
                      disabled={busy}
                      className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-700 shadow-glow hover:opacity-95 transition-opacity disabled:opacity-60"
                    >
                      {busy ? '保存中…' : draft.id ? '保存修改' : '记下来'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setDraft({ ...EMPTY_DRAFT })}
                className="w-full mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary-200 bg-ui-surface hover:bg-white hover:border-primary-400 px-5 py-4 text-left transition-colors group"
              >
                <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100">
                  <IconPlus className="w-5 h-5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-800">记一篇新的灵修</span>
                  <span className="block text-xs text-ink-400 mt-0.5">写下今日的领受、祷告与感恩</span>
                </span>
              </button>
            )}

            {/* 筛选 */}
            {(data?.months?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="按月份筛选">
                <button
                  onClick={() => setMonth('')}
                  aria-pressed={!month}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    !month ? 'bg-ink-800 text-white border-transparent' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400'
                  }`}
                >
                  全部
                </button>
                {data!.months.map((m) => (
                  <button
                    key={m.month}
                    onClick={() => setMonth(month === m.month ? '' : m.month)}
                    aria-pressed={month === m.month}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      month === m.month ? 'bg-ink-800 text-white border-transparent' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400'
                    }`}
                  >
                    {fmtMonth(m.month)}
                    <span className="ml-1 opacity-60">{m.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mb-6">
              <input
                name="q"
                aria-label="搜索标题、内容或经文"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="搜索标题、内容或经文…"
                className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>

            {/* 列表 */}
            {error ? (
              <p role="alert" className="text-rose-600 text-sm">{error}</p>
            ) : loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="glass rounded-2xl p-5 h-24 animate-pulse border border-white/40" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center shadow-card border border-white/40">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <IconBookOpen className="w-7 h-7" strokeWidth={1.5} />
                </div>
                <p className="text-ink-600 font-medium">
                  {q || month ? '没有符合条件的灵修日记。' : '还没有灵修日记。'}
                </p>
                {!q && !month && (
                  <>
                    <p className="text-ink-500 text-sm mt-1.5">灵修是信仰生活的呼吸——今天就开始记第一篇吧。</p>
                    <button
                      onClick={() => setDraft({ ...EMPTY_DRAFT })}
                      className="btn-primary text-sm mt-5 inline-flex items-center gap-1.5"
                    >
                      <IconPencil className="w-4 h-4" strokeWidth={1.9} />
                      记第一篇
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(([m, list]) => (
                  <div key={m}>
                    <p className="text-xs font-semibold text-ink-400 mb-2 px-1">{fmtMonth(m)}</p>
                    <div className="space-y-3">
                      {list.map((it) => (
                        <div key={it.id} className="glass rounded-2xl p-5 shadow-card border border-white/40">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <h3 className="font-display text-base font-bold text-ink-900 truncate">
                                {it.title?.trim() || '无标题'}
                              </h3>
                              <p className="text-xs text-ink-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>{fmt(it.createdAt)}</span>
                                {it.mood && (
                                  <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-600">{it.mood}</span>
                                )}
                                {it.ref && (
                                  <span className="inline-flex items-center gap-1 text-primary-600">
                                    <IconBookOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />{it.ref}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() =>
                                  setDraft({ id: it.id, title: it.title, ref: it.ref, mood: it.mood, body: it.body })
                                }
                                title="编辑"
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                              >
                                <IconPencil className="w-4 h-4" strokeWidth={1.6} />
                              </button>
                              <button
                                onClick={() => askDelete(it)}
                                title="删除"
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <IconClose className="w-4 h-4" strokeWidth={1.6} />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap break-words font-serif">
                            {it.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {data && data.total > items.length && (
                  <p className="text-center text-xs text-ink-400 pt-2">
                    共 {data.total} 篇，已显示最近 {items.length} 篇
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
