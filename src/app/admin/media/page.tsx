'use client';

import { useState } from 'react';
import { apiPatch, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface MediaFile {
  id: string; fileName: string; title: string; mimeType: string; kind: string; extension: string;
  sizeBytes: number; storageKey: string; status: string; reviewStatus: string; reviewReason: string;
  refCount: number; taskCount: number; taskFailed: number; createdAt: string; owner: string; url: string;
}

const KIND_LABEL: Record<string, string> = { image: '图片', audio: '音乐', video: '视频', score: '曲谱', doc: '资料' };
const STATUS_MAP: Record<string, { tone: 'green' | 'gold' | 'red' | 'gray'; label: string }> = {
  ready: { tone: 'green', label: '就绪' },
  transcoding: { tone: 'gold', label: '转码中' },
  failed: { tone: 'red', label: '失败' },
  trashed: { tone: 'gray', label: '回收站' },
};
const REVIEW_MAP: Record<string, { tone: 'green' | 'gold' | 'red'; label: string }> = {
  pending: { tone: 'gold', label: '待审核' },
  approved: { tone: 'green', label: '已通过' },
  rejected: { tone: 'red', label: '已驳回' },
};

function fmtSize(n: number) {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function AdminMediaPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const notice = useNotice();
  const confirmNav = useConfirmNav();
  const { data, loading, error, reload } = useApi<{
    items: MediaFile[];
    total: number;
    totals: { files: number; bytes: number; failed: number; transcoding: number; trashed: number; pendingReview: number; pendingTasks: number; failedTasks: number };
    byKind: { kind: string; c: number; bytes: number }[];
  }>(`/admin/media?q=${encodeURIComponent(q)}&kind=${kind}&status=${status}&reviewStatus=${reviewStatus}`, [q, kind, status, reviewStatus]);

  async function act(id: string, action: 'trash' | 'restore') {
    setBusy(id); setMsg('');
    try {
      await apiPatch('/admin/media', { mediaId: id, action });
      setMsg(action === 'trash' ? '已移入回收站' : '已恢复');
      reload();
    } catch (e: any) { setMsg(e?.message || '操作失败'); } finally { setBusy(null); }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    if (action === 'reject') {
      // 驳回需要填写原因 —— 跳转到独立确认页完成输入，不使用 prompt 弹框
      confirmNav({
        title: '驳回该媒体文件',
        desc: '驳回后该文件将不对会员展示，上传者可在「我的媒体」中看到驳回原因。',
        danger: true,
        confirmText: '确认驳回',
        cancelText: '取消',
        back: '/admin/media',
        action: 'admin.media.reject',
        params: { mediaId: id },
        input: {
          label: '驳回原因',
          placeholder: '（可选）例如：内容不清晰 / 涉及版权 / 与主题无关',
          multiline: true,
        },
        onConfirm: async (reason) => {
          await apiPost(`/admin/media/${id}/review`, { action: 'reject', reason });
          notice.success('已驳回');
        },
      });
      return;
    }
    setBusy(id); setMsg('');
    try {
      await apiPost(`/admin/media/${id}/review`, { action, reason: '' });
      setMsg('已通过审核');
      notice.success('已通过审核');
      reload();
    } catch (e: any) { setMsg(e?.message || '操作失败'); notice.error(e?.message || '操作失败'); } finally { setBusy(null); }
  }

  const items = data?.items || [];
  const t = data?.totals;

  return (
    <AdminLayout>
      <SectionTitle>媒体中心</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">上传审核、文件、转码任务、失败任务与回收站</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard title="文件总数" value={t?.files ?? '—'} hint={`占用 ${fmtSize(t?.bytes || 0)}`} />
        <StatCard title="待审核" value={t?.pendingReview ?? 0} />
        <StatCard title="转码中" value={t?.transcoding ?? 0} />
        <StatCard title="失败任务" value={t?.failedTasks ?? 0} />
        <StatCard title="回收站" value={t?.trashed ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input-styled flex-1 min-w-[160px]" placeholder="搜索标题 / 文件名" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input-styled" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
          <option value="">全部审核状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
        <select className="input-styled" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input-styled" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {msg ? <div className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无文件" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">文件</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-right px-4 py-3 font-medium">大小</th>
                <th className="text-center px-4 py-3 font-medium">任务</th>
                <th className="text-center px-4 py-3 font-medium">处理</th>
                <th className="text-center px-4 py-3 font-medium">审核</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900 line-clamp-1 max-w-[240px]">{m.title || m.fileName}</div>
                    <div className="text-xs text-ink-400">{m.owner || '系统'} · {m.createdAt?.slice(0, 10)} · 引用{m.refCount}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone="primary">{KIND_LABEL[m.kind] || m.kind}</Badge></td>
                  <td className="px-4 py-3 text-right text-ink-600">{fmtSize(m.sizeBytes)}</td>
                  <td className="px-4 py-3 text-center text-ink-600">
                    {m.taskCount > 0 ? `${m.taskCount} 项` : '—'}
                    {m.taskFailed > 0 ? <span className="text-rose-600 text-xs ml-1">失败{m.taskFailed}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-center"><Badge tone={STATUS_MAP[m.status]?.tone || 'gray'}>{STATUS_MAP[m.status]?.label || m.status}</Badge></td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={REVIEW_MAP[m.reviewStatus]?.tone || 'gray'}>{REVIEW_MAP[m.reviewStatus]?.label || m.reviewStatus}</Badge>
                    {m.reviewStatus === 'rejected' && m.reviewReason ? (
                      <div className="text-[11px] text-rose-500 mt-1 line-clamp-1 max-w-[160px]" title={m.reviewReason}>{m.reviewReason}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {m.reviewStatus === 'pending' ? (
                      <>
                        <button disabled={busy === m.id} onClick={() => review(m.id, 'approve')} className="text-emerald-600 hover:underline disabled:opacity-50 mr-2">通过</button>
                        <button disabled={busy === m.id} onClick={() => review(m.id, 'reject')} className="text-rose-600 hover:underline disabled:opacity-50 mr-2">驳回</button>
                      </>
                    ) : null}
                    {m.status === 'trashed' ? (
                      <button disabled={busy === m.id} onClick={() => act(m.id, 'restore')} className="text-emerald-600 hover:underline disabled:opacity-50">恢复</button>
                    ) : (
                      <button disabled={busy === m.id} onClick={() => act(m.id, 'trash')} className="text-ink-500 hover:underline disabled:opacity-50">删除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
