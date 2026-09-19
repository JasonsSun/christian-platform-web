'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiPatch, apiPost, qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';

import type { ContentItem } from '@/lib/types';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

interface FavFolderMeta {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  count: number;
}

const FOLDER_COLORS = ['primary', 'gold', 'emerald', 'rose', 'violet', 'sky'] as const;
const FOLDER_CHIP: Record<string, string> = {
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
  gold: 'bg-gold-50 text-gold-700 border-gold-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

/** 收藏内容 + 分类管理：左侧分类筛选，多选后可批量移动到其它分类 */
export function MyContentFavorites() {
  const [folder, setFolder] = useState('all');
  const [sel, setSel] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const { data, loading, error, reload } = useApi<{
    items: (ContentItem & { folderId?: string | null })[];
    folders: FavFolderMeta[];
    unfiled: number;
    total: number;
  }>(`/me/favorites${qs({ folder })}`, [folder]);

  const items = data?.items || [];
  const folders = data?.folders || [];
  const unfiled = data?.unfiled ?? 0;

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function applyMove() {
    if (!sel.length || !moveTo) return;
    setBusy(true);
    setErr('');
    try {
      await apiPatch('/me/favorites', { contentIds: sel, folderId: moveTo === '__unfiled' ? null : moveTo });
      setSel([]);
      setMoveTo('');
      reload();
    } catch (e: any) {
      setErr(e?.message || '移动失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr('');
    try {
      await apiPost('/me/favorite-folders', {
        name,
        color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
      });
      setNewName('');
      setCreating(false);
      reload();
    } catch (e: any) {
      setErr(e?.message || '创建失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: FavFolderMeta) {
    setBusy(true);
    setErr('');
    try {
      await apiDelete(`/me/favorite-folders/${f.id}`);
      if (folder === f.id) setFolder('all');
      reload();
    } catch (e: any) {
      setErr(e?.message || '删除失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      {/* 分类栏 */}
      <div className="bg-white rounded-2xl p-4 border border-ink-100 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFolder('all');
              setSel([]);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              folder === 'all'
                ? 'bg-primary-600 text-white border-primary-600 shadow-lg shadow-primary-500/20'
                : 'bg-white text-ink-600 border-ink-200 hover:border-primary-300'
            }`}
          >
            全部 {data?.total ?? 0}
          </button>
          <button
            onClick={() => {
              setFolder('unfiled');
              setSel([]);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              folder === 'unfiled'
                ? 'bg-ink-700 text-white border-ink-700'
                : 'bg-white text-ink-600 border-ink-200 hover:border-primary-300'
            }`}
          >
            未分类 {unfiled}
          </button>
          {folders.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1">
              <button
                onClick={() => {
                  setFolder(f.id);
                  setSel([]);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  folder === f.id
                    ? 'bg-primary-600 text-white border-primary-600 shadow-lg shadow-primary-500/20'
                    : `${FOLDER_CHIP[f.color] || FOLDER_CHIP.primary} hover:brightness-95`
                }`}
              >
                {f.name} {f.count}
              </button>
              <button
                onClick={() => remove(f)}
                disabled={busy}
                className="w-6 h-6 rounded-full text-ink-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                aria-label={`删除分类 ${f.name}`}
                title="删除分类（其中收藏退回未分类）"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={() => setCreating((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-sm font-medium border border-dashed border-ink-300 text-ink-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            + 新建分类
          </button>
        </div>

        {creating && (
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="新建分类名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
              }}
              placeholder="分类名，如：灵修素材、讲章参考"
              className="input-styled flex-1 min-w-[180px]"
              maxLength={60}
            />
            <button onClick={create} disabled={busy || !newName.trim()} className="btn-primary text-sm disabled:opacity-50">
              创建
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              className="px-4 py-2 rounded-xl border border-ink-200 text-sm text-ink-600"
            >
              取消
            </button>
          </div>
        )}

        {sel.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ink-100">
            <span className="text-sm text-ink-600">已选 {sel.length} 项</span>
            <select
              aria-label="移动到分类"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="input-styled w-auto min-w-[140px] text-sm"
            >
              <option value="">移动到…</option>
              <option value="__unfiled">未分类</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button onClick={applyMove} disabled={busy || !moveTo} className="btn-primary text-sm disabled:opacity-50">
              {busy ? '处理中…' : '应用'}
            </button>
            <button onClick={() => setSel([])} className="px-3 py-2 text-sm text-ink-500 hover:text-ink-700">
              取消选择
            </button>
          </div>
        )}

        {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
      </div>

      {items.length === 0 ? (
        <EmptyBlock
          text={folder === 'all' ? '还没有收藏任何内容' : '这个分类下还没有内容'}
          action={{ label: '去发现内容', href: '/community' }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((c) => {
            const selected = sel.includes(c.id);
            const cur = folders.find((f) => f.id === c.folderId);
            return (
              <div
                key={c.id}
                className={`bg-white rounded-2xl p-4 border card-hover relative ${
                  selected ? 'border-primary-400 ring-2 ring-primary-100' : 'border-ink-100'
                }`}
              >
                <button
                  onClick={() => toggle(c.id)}
                  aria-label={selected ? '取消选择' : '选择'}
                  className={`absolute top-3 right-3 w-6 h-6 rounded-md border flex items-center justify-center text-xs transition-colors ${
                    selected ? 'bg-primary-600 border-primary-600 text-white' : 'border-ink-300 text-transparent hover:border-primary-400'
                  }`}
                >
                  ✓
                </button>
                <Link href={`/contents/${c.id}`} className="block pr-7">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
                    <h3 className="font-semibold text-ink-900 truncate">{c.title}</h3>
                  </div>
                  <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body}</p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-ink-400">
                    <span><span aria-hidden="true">❤️</span> <span className="sr-only">点赞</span>{c.likeCount}</span>
                    <span><span aria-hidden="true">💬</span> <span className="sr-only">评论</span>{c.commentCount}</span>
                    {cur ? (
                      <span className={`px-2 py-0.5 rounded-full border ${FOLDER_CHIP[cur.color] || FOLDER_CHIP.primary}`}>
                        {cur.name}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full border border-ink-200 text-ink-400">未分类</span>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
