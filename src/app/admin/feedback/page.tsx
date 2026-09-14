'use client';

import { useState } from 'react';
import { apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { AdminLayout } from '@/app/admin/_components';

interface FeedbackItem {
  id: string;
  category: string;
  content: string;
  contact: string;
  pageUrl: string;
  status: string;
  adminReply: string;
  createdAt: string;
  handledAt: string | null;
  user: { username: string; displayName: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  idea: '功能建议',
  bug: '问题反馈',
  content: '内容相关',
  ux: '使用体验',
  other: '其他',
};

const STATUS_TABS = [
  { key: 'new', label: '待查看' },
  { key: 'processing', label: '处理中' },
  { key: 'done', label: '已处理' },
  { key: 'rejected', label: '暂不处理' },
  { key: 'all', label: '全部' },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]['key'];

const STATUS_LABEL: Record<string, string> = {
  new: '待查看',
  processing: '处理中',
  done: '已处理',
  rejected: '暂不处理',
};

export default function AdminFeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<StatusKey>('new');

  const { data, loading, error, reload } = useApi<{ items: FeedbackItem[] }>(
    user && (user.role === 'moderator' || user.role === 'admin')
      ? `/admin/feedback${qs({ status })}`
      : null,
    [user, status]
  );
  const items = data?.items || [];

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="py-16 text-center text-ink-400">加载中…</div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🔒</div>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
          <p className="text-ink-500">登录管理员账号后查看平台建议</p>
        </div>
      </AdminLayout>
    );
  }

  if (user.role !== 'moderator' && user.role !== 'admin') {
    return (
      <AdminLayout>
        <div className="py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🚫</div>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">无权限</h2>
          <p className="text-ink-500">仅审核员或管理员可查看平台建议</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">平台建议</h1>
      <p className="text-ink-500 text-sm mb-6">
        使用者提交的功能建议与问题反馈，仅管理员可见 —— 用来决定后续开发什么
      </p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-ink-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              status === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-16 text-center text-ink-400">加载中…</div>}
      {error && (
        <div className="py-10 text-center rounded-2xl bg-rose-50 text-rose-700">
          <div>{error}</div>
          <button className="btn-secondary mt-3" onClick={reload}>重试</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-12 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
          该分类下暂无建议
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((it) => (
            <FeedbackCard key={it.id} item={it} onChanged={reload} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function FeedbackCard({ item, onChanged }: { item: FeedbackItem; onChanged: () => void }) {
  const action = useAction();
  const [status, setStatus] = useState(item.status);
  const [reply, setReply] = useState(item.adminReply || '');
  const [saved, setSaved] = useState(false);

  async function save() {
    const res = await action.run(() =>
      apiPatch<{ ok: boolean; status: string }>(`/admin/feedback/${item.id}`, {
        status,
        adminReply: reply,
      })
    );
    if (res) {
      setSaved(true);
      onChanged();
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-ink-100 shadow-soft">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
          {CATEGORY_LABEL[item.category] || item.category}
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-600 text-xs font-medium">
          {STATUS_LABEL[item.status] || item.status}
        </span>
        <span className="text-xs text-ink-400 ml-auto">{timeAgo(item.createdAt)}</span>
      </div>

      <div className="text-sm text-ink-700 space-y-1">
        <p>
          <span className="text-ink-500">提交人：</span>
          {item.user ? (
            <>
              {item.user.displayName}
              <span className="text-ink-400">（@{item.user.username}）</span>
            </>
          ) : (
            <span className="text-ink-400">匿名</span>
          )}
        </p>
        {item.contact && <p><span className="text-ink-500">联系方式：</span>{item.contact}</p>}
        {item.pageUrl && (
          <p className="break-all"><span className="text-ink-500">来源页面：</span>{item.pageUrl}</p>
        )}
        <p className="mt-2 p-3 rounded-xl bg-ink-50 text-ink-700 whitespace-pre-wrap">{item.content}</p>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-ink-500">状态</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setSaved(false); }}
            className="input-styled !w-auto text-sm"
          >
            {STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <textarea
          value={reply}
          onChange={(e) => { setReply(e.target.value); setSaved(false); }}
          className="input-styled min-h-[72px]"
          placeholder="回复内容（选填，提交人会在站内收到通知）"
        />
        {action.error && <p className="text-xs text-rose-600">{action.error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={action.pending}
            className="btn-primary text-sm disabled:opacity-70"
          >
            {action.pending ? '保存中…' : '保存'}
          </button>
          {saved && <span className="text-xs text-emerald-600">已保存 ✓</span>}
          {item.handledAt && <span className="text-xs text-ink-400 ml-auto">最近处理：{timeAgo(item.handledAt)}</span>}
        </div>
      </div>
    </div>
  );
}
