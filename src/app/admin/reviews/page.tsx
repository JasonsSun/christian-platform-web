'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { contentTypeLabel } from '@/lib/labels';
import { AdminLayout, StatusBadge, Loading, Empty, ErrorBox, Badge, PageHead, Toolbar, Pagination, AccessState } from '../_components';
import type { ReviewTask } from '@/lib/types';

const TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'all', label: '全部' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function ReviewCard({
  task,
  onDecide,
  deciding,
}: {
  task: ReviewTask;
  onDecide: (action: 'approve' | 'reject', reason?: string) => void;
  deciding: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const c = task.content;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 shadow-soft hair-top">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink-900 truncate">{c.title}</span>
            <Badge tone="primary">{contentTypeLabel(c.contentType)}</Badge>
            <StatusBadge status={task.status} />
          </div>
          <div className="text-xs text-ink-400 mt-1">
            作者：{c.author.displayName}（{c.author.username}） · 提交于 {timeAgo(task.createdAt)}
          </div>
        </div>
      </div>

      <div className={`mt-3 text-sm text-ink-700 whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
        {c.body}
      </div>
      {c.body && c.body.length > 80 ? (
        <button className="text-xs text-primary-600 py-1.5 -my-1.5" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      ) : null}

      {task.status !== 'pending' ? (
        // 已审核完成的任务不再展示「通过/驳回」，避免误操作（后端也会返回 409）
        <div className="mt-4 text-sm">
          {task.status === 'approved' ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              已通过并发布，审核已完成
            </span>
          ) : (
            <span className="inline-flex items-start gap-1.5 text-rose-600 font-medium break-words">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>已驳回{task.reason ? `：${task.reason}` : ''}，审核已完成</span>
            </span>
          )}
        </div>
      ) : rejecting ? (
        <div className="mt-3">
          <textarea
            className="input-styled input-sm w-full"
            rows={2}
            aria-label="驳回原因"
            placeholder="驳回原因（选填，将通知作者）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              className="btn-chip btn-chip-danger"
              disabled={deciding}
              onClick={() => {
                onDecide('reject', reason.trim() || undefined);
                setRejecting(false);
                setReason('');
              }}
            >
              确认驳回
            </button>
            <button className="btn-chip" disabled={deciding} onClick={() => setRejecting(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-4">
          <button
            className="btn-chip btn-chip-safe"
            disabled={deciding}
            onClick={() => onDecide('approve')}
          >
            通过
          </button>
          <button className="btn-chip btn-chip-danger" disabled={deciding} onClick={() => setRejecting(true)}>
            驳回
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminReviewsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabKey>('pending');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [notice, setNotice] = useState<string | null>(null);

  const path = `/moderation/queue${qs({ status: tab, page, pageSize })}`;
  const { data, loading, error, reload } = useApi<{ items: ReviewTask[]; total: number }>(path, [tab, page]);
  const { run, pending } = useAction();

  if (authLoading) return <AdminLayout><Loading rows={4} /></AdminLayout>;
  if (user === null)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="登录审核员或管理员账号后查看审核队列。" href="/login?next=/admin/reviews" />
      </AdminLayout>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要审核员或管理员角色。" />
      </AdminLayout>
    );

  async function decide(taskId: string, action: 'approve' | 'reject', reason?: string) {
    const ok = await run(async () => {
      await apiPost(`/moderation/${taskId}/action`, { action, reason });
    });
    if (ok !== null) {
      setNotice(action === 'approve' ? '已通过，内容已发布并通知作者。' : '已驳回，内容已标记为驳回。');
      reload();
    }
  }

  function switchTab(k: TabKey) {
    setTab(k);
    setPage(1);
    setNotice(null);
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="内容 · 治理"
        title="审核队列"
        sub="逐条查看待审内容，通过后自动发布并通知作者；驳回会附上原因。"
        actions={
          <>
            <Link href="/admin/contents" className="btn-secondary btn-sm min-h-11 lg:min-h-0">
              内容总览
            </Link>
            {/* 文案固定：刷新时改成「刷新中…」会加宽按钮，把同一行的右侧往左撑 24px */}
            <button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload} disabled={loading}>刷新</button>
          </>
        }
      />

      <Toolbar>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`min-h-11 lg:min-h-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white shadow-card' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
            aria-pressed={tab === t.key}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </Toolbar>

      {notice ? (
        <div role="status" className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-2 text-sm">{notice}</div>
      ) : null}

      {loading && !data ? (
        <Loading rows={4} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty label="暂无需要处理的审核任务" hint="换一个页签看看历史任务" />
      ) : (
        <>
          <div className="flex flex-col gap-4" data-reveal-group>
            {data.items.map((task) => (
              <ReviewCard key={task.id} task={task} onDecide={(a, r) => decide(task.id, a, r)} deciding={pending} />
            ))}
          </div>
          <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} />
        </>
      )}
    </AdminLayout>
  );
}
