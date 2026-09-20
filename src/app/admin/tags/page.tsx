'use client';

import { useState } from 'react';
import { apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { AdminLayout, AdminSelect, Loading, Empty, ErrorBox, PageHead, Toolbar } from '../_components';

interface TagRow {
  name: string;
  total: number;
  published: number;
}

/**
 * 标签是 contents.tags 里的虚拟维度（没有独立表），所以这里提供的是
 * 「使用统计 + 批量改写」：重命名 / 合并 / 删除，三者都是对内容标签字符串做替换。
 */
export default function AdminTagsPage() {
  const { user, loading: authLoading } = useAuth();
  const [kw, setKw] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'count' | 'name'>('count');

  const canSee = !!user && (user.role === 'admin' || user.role === 'moderator');
  const { data, loading, error, reload } = useApi<{ items: TagRow[]; total: number }>(
    canSee ? `/admin/tags${qs({ q: search, sort })}` : null,
    [canSee, search, sort]
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [op, setOp] = useState<'rename' | 'merge' | 'delete' | null>(null);
  const [target, setTarget] = useState('');
  const act = useAction();

  const items = data?.items || [];
  const maxCount = items.reduce((m, t) => Math.max(m, t.total), 1);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  async function submit() {
    if (!op || !selected.length) return;
    if ((op === 'rename' || op === 'merge') && !target.trim()) return;
    const res = await act.run(() => apiPatch('/admin/tags', { op, from: selected, to: target.trim() }));
    if (res) { setSelected([]); setOp(null); setTarget(''); reload(); }
  }

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user) return <AdminLayout><Empty label="请先登录" /></AdminLayout>;
  if (!canSee) return <AdminLayout><Empty label="无权限访问（需要内容模块审核员或管理员）" /></AdminLayout>;

  return (
    <AdminLayout>
      <PageHead
        eyebrow="内容 · 治理"
        title="标签管理"
        sub="内容标签没有独立表，这里按全站内容聚合统计。重命名 / 合并 / 删除会直接改写相关内容的标签字段。"
        actions={<button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload}>刷新</button>}
      />

      <Toolbar>
        <form className="flex flex-1 min-w-[13rem] sm:min-w-[15rem] gap-2 items-stretch sm:items-center" onSubmit={(e) => { e.preventDefault(); setSearch(kw.trim()); }}>
          <input aria-label="搜索标签名称" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索标签" className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 min-w-0" />
          <button type="submit" className="btn-secondary text-sm min-h-11 lg:min-h-0 shrink-0">搜索</button>
          {search && <button type="button" onClick={() => { setKw(''); setSearch(''); }} className="btn-secondary text-sm min-h-11 lg:min-h-0 shrink-0">清空</button>}
        </form>
        <AdminSelect
          label="标签排序方式"
          value={sort}
          onChange={(v) => setSort(v as 'count' | 'name')}
          options={[
            { value: 'count', label: '按使用量' },
            { value: 'name', label: '按名称' },
          ]}
        />
      </Toolbar>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-primary-50 border border-primary-100">
          <span className="num text-sm font-semibold text-primary-700">已选 {selected.length} 个标签</span>
          <button onClick={() => { setOp('rename'); }} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs">重命名（单个）</button>
          <button onClick={() => { setOp('merge'); }} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs">合并为一个</button>
          <button onClick={() => { setOp('delete'); }} className="btn-secondary btn-sm min-h-11 lg:min-h-0 text-xs text-rose-600 border-rose-200">删除</button>
          <button onClick={() => setSelected([])} className="min-h-11 lg:min-h-0 px-2 text-xs text-ink-500 ml-auto">取消选择</button>
        </div>
      )}

      {op && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-ink-50 border border-ink-200">
          {op === 'delete' ? (
            <p className="text-sm text-ink-700">
              将从全部内容中移除标签 <span className="font-semibold">{selected.join('、')}</span>，不可撤销。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-700">
                {op === 'rename' ? '将' : '将'} <span className="font-semibold">{selected.join('、')}</span> {op === 'merge' ? '合并为' : '重命名为'}
              </span>
              <input
                aria-label={op === 'merge' ? '合并后的目标标签名' : '重命名后的目标标签名'}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="目标标签名"
                className="input-styled w-48"
                autoFocus
              />
            </div>
          )}
          {op === 'rename' && selected.length > 1 && (
            <p className="text-xs text-gold-700 mt-1.5">重命名只应选择一个标签，多个请用「合并为一个」。</p>
          )}
          {act.error && <p role="alert" className="text-xs text-rose-600 mt-2">{act.error}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setOp(null); setTarget(''); }} className="btn-secondary text-xs">取消</button>
            <button
              onClick={submit}
              disabled={act.pending || ((op === 'rename' || op === 'merge') && !target.trim())}
              className={`text-xs px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-60 ${op === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary-600 hover:bg-primary-700'}`}
            >
              {act.pending ? '处理中…' : '确认'}
            </button>
          </div>
        </div>
      )}

      {loading && <Loading rows={3} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && items.length === 0 && (
        <Empty icon="search" label="还没有任何标签" hint="内容发布时带上标签，这里就会出现统计与批量改写入口" />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="hair-top bg-white rounded-2xl border border-ink-100 shadow-soft p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {items.map((t) => {
              const on = selected.includes(t.name);
              const w = 12 + Math.round((t.total / maxCount) * 8);
              return (
                <button
                  key={t.name}
                  onClick={() => toggle(t.name)}
                  title={`${t.name}：${t.total} 篇内容（${t.published} 篇已发布）`}
                  aria-pressed={on}
                  className={`min-h-11 lg:min-h-0 px-3.5 lg:px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                    on ? 'bg-primary-600 text-white border-primary-600' : 'bg-ink-50 text-ink-700 border-ink-200 hover:border-primary-300'
                  }`}
                  style={{ fontSize: `${w}px` }}
                >
                  {t.name}
                  <span className={`num ml-1.5 text-[11px] ${on ? 'text-white/80' : 'text-ink-400'}`}>{t.total}</span>
                </button>
              );
            })}
          </div>
          <p className="num text-xs text-ink-400 mt-4">共 {data?.total ?? items.length} 个标签（最多展示 500 个）</p>
        </div>
      )}
    </AdminLayout>
  );
}
