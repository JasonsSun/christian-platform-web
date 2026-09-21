'use client';

import { useState } from 'react';
import { apiGet, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { reportStatusLabel } from '@/lib/labels';
import { AdminLayout, Loading, Empty, ErrorBox, PageHead, AccessState } from '@/app/admin/_components';

interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: string;
  reporter: { username: string; displayName: string };
  contentTitle?: string;
  contentAuthor?: string;
}

const REASON_LABEL: Record<string, string> = {
  spam: '垃圾广告',
  harmful: '有害信息',
  heresy: '异端偏差',
  copyright: '侵权',
  offensive: '冒犯性内容',
  other: '其他',
};

const STATUS_TABS = [
  { key: 'open', label: '待处理' },
  { key: 'dismissed', label: '已驳回' },
  { key: 'upheld', label: '已成立' },
  { key: 'all', label: '全部' },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]['key'];

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<StatusKey>('open');

  const { data, loading, error, reload } = useApi<{ items: ReportItem[] }>(
    user && (user.role === 'moderator' || user.role === 'admin')
      ? `/admin/reports${qs({ status })}`
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
        <AccessState
          title="请先登录"
          desc="登录管理员账号后查看举报处理队列"
          href="/login"
        />
      </AdminLayout>
    );
  }

  if (user.role !== 'moderator' && user.role !== 'admin') {
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限" desc="仅审核员或管理员可访问举报处理队列" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="社交 · 治理"
        title="举报处理"
        sub="处理用户提交的内容举报，维护社区秩序"
      />

      {/* status tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-ink-200" role="tablist" aria-label="按处理状态筛选">
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
        <Empty label="该分类下暂无举报" hint="社区很安静，换一个状态页签看看" />
      )}

      {items.length > 0 && (
        <div
          className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
          data-reveal-group
        >
          {items.map((r) => (
            <ReportCard key={r.id} report={r} onChanged={reload} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function ReportCard({ report, onChanged }: { report: ReportItem; onChanged: () => void }) {
  const action = useAction();
  const [confirmUpheld, setConfirmUpheld] = useState(false);
  const [upholdReason, setUpholdReason] = useState('');

  async function doAction(act: 'dismiss' | 'uphold') {
    const body: { action: 'dismiss' | 'uphold'; reason?: string } = { action: act };
    if (act === 'uphold' && upholdReason.trim()) body.reason = upholdReason.trim();
    const res = await action.run(() => apiPost<{ ok: boolean; status: string }>(`/admin/reports/${report.id}/action`, body));
    if (res) {
      setConfirmUpheld(false);
      setUpholdReason('');
      onChanged();
    }
  }

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 shadow-soft hair-top">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium ring-1 ring-inset ring-rose-500/15">
          {REASON_LABEL[report.reason] || report.reason}
        </span>
        <span className="text-xs text-ink-400">对象：{report.targetType}</span>
        <span className="text-xs text-ink-400 ml-auto">{timeAgo(report.createdAt)}</span>
      </div>

      <div className="text-sm text-ink-700 space-y-1">
        <p>
          <span className="text-ink-500">举报人：</span>
          {report.reporter.displayName}
          <span className="text-ink-400">（@{report.reporter.username}）</span>
        </p>
        {report.contentTitle && (
          <p><span className="text-ink-500">内容标题：</span>{report.contentTitle}</p>
        )}
        {report.contentAuthor && (
          <p><span className="text-ink-500">作者：</span>@{report.contentAuthor}</p>
        )}
        {report.detail && (
          <p className="mt-2 p-3 rounded-xl bg-ink-50 text-ink-700 whitespace-pre-wrap">{report.detail}</p>
        )}
      </div>

      {report.status === 'open' ? (
        <div className="flex flex-wrap gap-2 mt-4">
          {!confirmUpheld ? (
            <>
              <button
                onClick={() => doAction('dismiss')}
                disabled={action.pending}
                className="btn-secondary min-h-11 lg:min-h-0 text-sm disabled:opacity-70"
              >
                忽略举报
              </button>
              <button
                onClick={() => setConfirmUpheld(true)}
                disabled={action.pending}
                className="btn-primary min-h-11 lg:min-h-0 text-sm bg-rose-600 hover:bg-rose-700 disabled:opacity-70"
              >
                成立并下架
              </button>
            </>
          ) : (
            <div className="w-full rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-rose-700">确认成立该举报？内容将被下架，此操作不可撤销。</p>
              <input
                aria-label="举报成立下架原因"
                value={upholdReason}
                onChange={(e) => setUpholdReason(e.target.value)}
                placeholder="处理原因（选填）"
                className="input-styled min-h-11 lg:min-h-0"
              />
              {action.error && <p role="alert" className="text-xs text-rose-600">{action.error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setConfirmUpheld(false)} className="btn-secondary min-h-11 lg:min-h-0 flex-1 text-sm">取消</button>
                <button
                  onClick={() => doAction('uphold')}
                  disabled={action.pending}
                  className="flex-1 min-h-11 lg:min-h-0 text-sm py-2.5 rounded-xl text-white font-medium bg-rose-600 hover:bg-rose-700 disabled:opacity-70"
                >
                  {action.pending ? '处理中…' : '确认下架'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 text-sm">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            report.status === 'upheld' ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-600'
          }`}>
            {reportStatusLabel(report.status)}
          </span>
        </div>
      )}
    </div>
  );
}
