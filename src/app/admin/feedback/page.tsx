'use client';

import { useId, useState } from 'react';
import { apiPatch, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { AdminLayout, Loading, Empty, ErrorBox, PageHead, AccessState, AdminSelect } from '@/app/admin/_components';
import { IconCheck } from '@/components/icons';

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
    return <AdminLayout><Loading rows={4} /></AdminLayout>;
  }

  if (!user) {
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="登录管理员账号后查看平台建议" href="/login?next=/admin/feedback" />
      </AdminLayout>
    );
  }

  if (user.role !== 'moderator' && user.role !== 'admin') {
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限" desc="仅审核员或管理员可查看平台建议" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="运营 · 用户声音"
        title="平台建议"
        sub="使用者提交的功能建议与问题反馈，仅管理员可见 —— 用来决定后续开发什么"
      />

      <div className="flex flex-wrap gap-2 mb-6 border-b border-ink-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            aria-current={status === t.key ? 'true' : undefined}
            className={`min-h-11 lg:min-h-0 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              status === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 切状态页签时 useApi 会留着上一批数据，列表不能因此整块消失 */}
      {loading && items.length === 0 && <Loading rows={4} />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <Empty label="该分类下暂无建议" hint="换一个状态页签看看别的反馈" />
      )}

      {items.length > 0 && (
        <div
          className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
          data-reveal-group
        >
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
  // 每张反馈卡都在 map 里渲染，id 必须逐实例唯一
  const uid = useId();

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
    <div className="glass rounded-2xl p-4 sm:p-5 shadow-soft hair-top">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium ring-1 ring-inset ring-primary-500/15">
          {CATEGORY_LABEL[item.category] || item.category}
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-600 text-xs font-medium ring-1 ring-inset ring-ink-500/15">
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
          <span className="text-xs font-semibold text-ink-500">状态</span>
          <AdminSelect
            id={`${uid}-status`}
            value={status}
            label="反馈处理状态"
            onChange={(v) => { setStatus(v); setSaved(false); }}
            options={STATUS_TABS.filter((t) => t.key !== 'all').map((t) => ({ value: t.key, label: t.label }))}
          />
        </div>
        <textarea
          aria-label="回复反馈提交人"
          value={reply}
          onChange={(e) => { setReply(e.target.value); setSaved(false); }}
          className="input-styled min-h-[72px]"
          placeholder="回复内容（选填，提交人会在站内收到通知）"
        />
        {action.error && <p role="alert" className="text-xs text-rose-600">{action.error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={save}
            disabled={action.pending}
            className="btn-primary min-h-11 lg:min-h-0 text-sm disabled:opacity-70"
          >
            {action.pending ? '保存中…' : '保存'}
          </button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <IconCheck className="w-3.5 h-3.5" strokeWidth={2} />
              已保存
            </span>
          )}
          {item.handledAt && <span className="text-xs text-ink-400 ml-auto">最近处理：{timeAgo(item.handledAt)}</span>}
        </div>
      </div>
    </div>
  );
}
