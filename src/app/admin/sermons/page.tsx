'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { apiPatch, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { AdminLayout, SectionTitle, Loading, TableSkeleton, TableShell, Th, Empty, ErrorBox, Badge, PageHead, Toolbar, AdminSelect } from '../_components';
import { IconPlus } from '@/components/icons';
import Portal from '@/components/Portal';

interface SermonItem {
  id: string;
  seriesId: string | null;
  seriesTitle: string | null;
  title: string;
  speaker: string;
  scripture: string;
  preachedAt: string | null;
  mediaType: 'audio' | 'video' | 'none';
  viewCount: number;
  likeCount: number;
  status: string;
  createdAt: string;
}
interface SeriesItem {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  status: string;
  sermonCount?: number;
}

const STATUS_TONE: Record<string, 'green' | 'gold' | 'gray'> = {
  published: 'green',
  draft: 'gray',
};

export default function AdminSermonsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'sermons' | 'series'>('sermons');

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user || (user.role !== 'admin' && user.role !== 'moderator'))
    return (
      <AdminLayout>
        <div className="text-center text-ink-500 py-20">无权限访问（需要媒体模块审核员或管理员角色）。</div>
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <div className="flex items-center gap-2 mb-6">
        <button
          className={`px-4 py-2 rounded-xl font-medium text-sm ${tab === 'sermons' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`}
          onClick={() => setTab('sermons')}
        >
          讲道
        </button>
        <button
          className={`px-4 py-2 rounded-xl font-medium text-sm ${tab === 'series' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`}
          onClick={() => setTab('series')}
        >
          讲道系列
        </button>
      </div>
      {tab === 'sermons' ? <SermonManager /> : <SeriesManager />}
    </AdminLayout>
  );
}

function SermonManager() {
  const notice = useNotice();
  const { convert } = useI18n();
  const confirmNav = useConfirmNav();
  const [q, setQ] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [editing, setEditing] = useState<SermonItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: seriesData } = useApi<{ items: SeriesItem[] }>('/sermon-series');
  const { data, loading, error, reload } = useApi<{ items: SermonItem[]; total: number }>(
    `/sermons?includeDrafts=${includeDrafts ? 1 : 0}&q=${encodeURIComponent(q)}&seriesId=${seriesId}&pageSize=50`,
    [q, seriesId, includeDrafts]
  );

  const items = data?.items || [];

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(s: SermonItem) {
    setEditing(s);
    setShowForm(true);
  }
  function remove(s: SermonItem) {
    confirmNav({
      title: '删除讲道',
      desc: `确认删除《${s.title}》？该操作不可逆，点赞记录也会一并清除。`,
      danger: true,
      confirmText: '确认删除',
      action: 'sermon.delete',
      params: { id: s.id },
      onConfirm: async () => {
        notice.success('已删除');
        reload();
      },
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="内容 · 讲道"
        title="讲道管理"
        actions={
          <button className="btn-primary btn-sm min-h-11 lg:min-h-0 inline-flex items-center gap-1.5" onClick={openCreate}>
            <IconPlus className="w-4 h-4" strokeWidth={2} />
            新建讲道
          </button>
        }
      />

      <Toolbar>
        <input aria-label="搜索讲道标题 / 讲员 / 经文" className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 min-w-[160px]" placeholder="搜索标题/讲员/经文" value={q} onChange={(e) => setQ(e.target.value)} />
        <AdminSelect
          value={seriesId}
          label="按讲道系列筛选"
          onChange={setSeriesId}
          options={[
            { value: '', label: '全部系列' },
            ...(seriesData?.items || []).map((s) => ({ value: s.id, label: convert(s.title) })),
          ]}
        />
        <label className="flex items-center gap-2 min-h-11 lg:min-h-0 text-sm text-ink-600 px-2">
          <input type="checkbox" className="h-5 w-5" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          含草稿
        </label>
      </Toolbar>

      {loading && !data ? (
        <TableSkeleton cols={7} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无讲道" />
      ) : (
        <TableShell busy={loading}>
          <table className="w-full text-sm">
              <caption className="sr-only">讲道管理</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">标题</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">讲员</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">系列</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">媒体</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">状态</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">数据</th>
                  <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                    <td className="px-4 py-3">
                      <Link href={`/sermons/${s.id}`} className="font-medium text-ink-900 hover:text-primary-700 line-clamp-1 max-w-[240px]">
                        {convert(s.title)}
                      </Link>
                      {s.scripture ? <div className="text-xs text-ink-400">{convert(s.scripture)}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-600">{s.speaker ? convert(s.speaker) : '—'}</td>
                    <td className="px-4 py-3 text-ink-600">{s.seriesTitle ? convert(s.seriesTitle) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone="primary">{s.mediaType === 'audio' ? '音频' : s.mediaType === 'video' ? '视频' : '文稿'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={STATUS_TONE[s.status] || 'gray'}>{s.status === 'published' ? '已发布' : '草稿'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-ink-500 whitespace-nowrap">播放 {s.viewCount} · 收藏 {s.likeCount}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="btn-chip mr-1.5">编辑</button>
                      <button onClick={() => remove(s)} className="btn-chip btn-chip-danger">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </TableShell>
      )}

      {showForm ? (
        <SermonForm
          editing={editing}
          series={seriesData?.items || []}
          onClose={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function SermonForm({
  editing,
  series,
  onClose,
  onDone,
}: {
  editing: SermonItem | null;
  series: SeriesItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const notice = useNotice();
  const { convert } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({
    seriesId: editing?.seriesId || '',
    title: editing?.title || '',
    speaker: editing?.speaker || '',
    scripture: editing?.scripture || '',
    preachedAt: editing?.preachedAt || '',
    mediaType: (editing?.mediaType || 'none') as 'audio' | 'video' | 'none',
    mediaUrl: '',
    durationSec: 0,
    description: '',
    notes: '',
    status: (editing?.status || 'published') as 'published' | 'draft',
    cover: '',
  });

  // 组件由父级条件渲染，挂载即代表已打开；保存中不关弹层，否则填好的讲道内容会白丢
  useEscape(true, () => {
    if (!busy) onClose();
  });
  const dlgRef = useDialogFocus(true);
  const titleId = useId();

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    if (!f.title.trim()) {
      setMsg('请填写讲道标题');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const payload = {
        seriesId: f.seriesId || null,
        title: f.title,
        speaker: f.speaker,
        scripture: f.scripture,
        preachedAt: f.preachedAt || null,
        mediaType: f.mediaType,
        mediaUrl: f.mediaUrl,
        durationSec: Number(f.durationSec) || 0,
        description: f.description,
        notes: f.notes,
        status: f.status,
        cover: f.cover,
      };
      if (editing) await apiPatch(`/sermons/${editing.id}`, payload);
      else await apiPost('/sermons', payload);
      notice.success(editing ? '已保存' : '已创建');
      onDone();
    } catch (e: any) {
      setMsg(e?.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose} data-guard="sermon-form">
        <div className="glass rounded-2xl p-6 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
          <h3 id={titleId} className="font-display text-xl font-bold text-ink-900 mb-4">{editing ? '编辑讲道' : '新建讲道'}</h3>
          {msg ? <div className="mb-3 text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{msg}</div> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 block">
              <span className="text-sm text-ink-600">标题 *</span>
              <input className="input-styled w-full mt-1" value={f.title} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">所属系列</span>
              <select className="input-styled w-full mt-1" value={f.seriesId} onChange={(e) => set('seriesId', e.target.value)}>
                <option value="">无（独立讲道）</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>{convert(s.title)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">讲员</span>
              <input className="input-styled w-full mt-1" value={f.speaker} onChange={(e) => set('speaker', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">经文范围</span>
              <input className="input-styled w-full mt-1" value={f.scripture} onChange={(e) => set('scripture', e.target.value)} placeholder="如 约翰福音 3:16-21" />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">讲道日期</span>
              <input type="date" className="input-styled w-full mt-1" value={f.preachedAt} onChange={(e) => set('preachedAt', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">媒体类型</span>
              <select className="input-styled w-full mt-1" value={f.mediaType} onChange={(e) => set('mediaType', e.target.value as any)}>
                <option value="none">仅文稿</option>
                <option value="audio">音频</option>
                <option value="video">视频</option>
              </select>
            </label>
            <label className="sm:col-span-2 block">
              <span className="text-sm text-ink-600">媒体链接（http/https）</span>
              <input className="input-styled w-full mt-1" value={f.mediaUrl} onChange={(e) => set('mediaUrl', e.target.value)} placeholder="音频/视频直链，如 https://..." />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">时长（秒）</span>
              <input type="number" min={0} className="input-styled w-full mt-1" value={f.durationSec} onChange={(e) => set('durationSec', Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">状态</span>
              <select className="input-styled w-full mt-1" value={f.status} onChange={(e) => set('status', e.target.value as any)}>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </select>
            </label>
            <label className="sm:col-span-2 block">
              <span className="text-sm text-ink-600">简介</span>
              <textarea className="input-styled w-full mt-1" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <label className="sm:col-span-2 block">
              <span className="text-sm text-ink-600">讲章大纲</span>
              <textarea className="input-styled w-full mt-1" rows={6} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="支持换行，将按原文展示" />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function SeriesManager() {
  const notice = useNotice();
  const { convert } = useI18n();
  const confirmNav = useConfirmNav();
  const { data, loading, error, reload } = useApi<{ items: SeriesItem[] }>('/sermon-series', []);
  const [editing, setEditing] = useState<SeriesItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  function remove(s: SeriesItem) {
    confirmNav({
      title: '删除讲道系列',
      desc: `确认删除系列《${s.title}》？其下 ${s.sermonCount || 0} 篇讲道的系列归属将置为空（讲道本身不会被删除）。`,
      danger: true,
      confirmText: '确认删除',
      action: 'sermon-series.delete',
      params: { id: s.id },
      onConfirm: async () => {
        notice.success('已删除');
        reload();
      },
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="内容 · 讲道"
        title="讲道系列"
        actions={
          <button className="btn-primary btn-sm min-h-11 lg:min-h-0 inline-flex items-center gap-1.5" onClick={() => { setEditing(null); setShowForm(true); }}>
            <IconPlus className="w-4 h-4" strokeWidth={2} />
            新建系列
          </button>
        }
      />
      {loading && !data ? (
        <Loading rows={3} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (data?.items || []).length === 0 ? (
        <Empty label="暂无系列" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-reveal-group>
          {(data?.items || []).map((s) => (
            <div key={s.id} className="glass rounded-2xl p-4 shadow-soft hair-top">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-ink-900">{convert(s.title)}</h3>
                <Badge tone={STATUS_TONE[s.status] || 'gray'}>{s.status === 'published' ? '已发布' : '草稿'}</Badge>
              </div>
              <p className="text-sm text-ink-500 mt-1 line-clamp-2">{convert(s.description) || '—'}</p>
              <div className="text-xs text-ink-400 mt-2">讲道数：{s.sermonCount || 0} · 排序：{s.sortOrder}</div>
              <div className="flex gap-3 mt-3">
                <button className="btn-chip" onClick={() => { setEditing(s); setShowForm(true); }}>编辑</button>
                <button className="btn-chip btn-chip-danger" onClick={() => remove(s)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <SeriesForm editing={editing} onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); reload(); }} />
      ) : null}
    </div>
  );
}

function SeriesForm({ editing, onClose, onDone }: { editing: SeriesItem | null; onClose: () => void; onDone: () => void }) {
  const notice = useNotice();
  const { convert } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({
    title: editing?.title || '',
    description: editing?.description || '',
    sortOrder: editing?.sortOrder ?? 0,
    status: (editing?.status || 'published') as 'published' | 'draft',
    cover: '',
  });
  // 组件由父级条件渲染，挂载即代表已打开；保存中不关弹层，否则填好的系列内容会白丢
  useEscape(true, () => {
    if (!busy) onClose();
  });
  const dlgRef = useDialogFocus(true);
  const titleId = useId();

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }
  async function submit() {
    if (!f.title.trim()) {
      setMsg('请填写系列标题');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const payload = { title: f.title, description: f.description, sortOrder: Number(f.sortOrder) || 0, status: f.status, cover: f.cover };
      if (editing) await apiPatch(`/sermon-series/${editing.id}`, payload);
      else await apiPost('/sermon-series', payload);
      notice.success(editing ? '已保存' : '已创建');
      onDone();
    } catch (e: any) {
      setMsg(e?.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Portal>
      <div ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose} data-guard="series-form">
        <div className="glass rounded-2xl p-6 w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
          <h3 id={titleId} className="font-display text-xl font-bold text-ink-900 mb-4">{editing ? '编辑系列' : '新建系列'}</h3>
          {msg ? <div className="mb-3 text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{msg}</div> : null}
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-sm text-ink-600">标题 *</span>
              <input className="input-styled w-full mt-1" value={f.title} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-ink-600">简介</span>
              <textarea className="input-styled w-full mt-1" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="text-sm text-ink-600">排序</span>
                <input type="number" className="input-styled w-full mt-1" value={f.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
              </label>
              <label className="block flex-1">
                <span className="text-sm text-ink-600">状态</span>
                <select className="input-styled w-full mt-1" value={f.status} onChange={(e) => set('status', e.target.value as any)}>
                  <option value="published">已发布</option>
                  <option value="draft">草稿</option>
                </select>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
