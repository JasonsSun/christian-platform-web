'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPatch, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { useAuth } from '@/lib/auth';
import { formatDate, formatSize } from '@/lib/format';
import { MEDIA_KIND_LABEL, mediaKindLabel } from '@/lib/labels';
import { canEnterAdmin, AdminLayout, SectionTitle, StatCard, Badge, Loading, TableSkeleton, Empty, ErrorBox, PageHead, Toolbar, AdminSelect, AccessState } from '../_components';

interface MediaFile {
  id: string; fileName: string; title: string; mimeType: string; kind: string; extension: string;
  sizeBytes: number; storageKey: string; status: string; reviewStatus: string; reviewReason: string;
  refCount: number; taskCount: number; taskFailed: number; createdAt: string; owner: string; url: string;
  source?: string; sourceRef?: string | null;
}

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

export default function AdminMediaPage() {
  const { user, loading: authLoading } = useAuth();
  // 媒体库的读和写都挂在 requireModeratorModule('media') 上：匿名进来先撞一趟 401，
  // 头顶那排 StatCard 又按 ?? 0 渲染成「0 个文件 / 0 B」，红框和假 0 同屏。
  const canSee = canEnterAdmin(user, '/admin/media');
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
  }>(
    canSee ? `/admin/media?q=${encodeURIComponent(q)}&kind=${kind}&status=${status}&reviewStatus=${reviewStatus}` : null,
    [canSee, q, kind, status, reviewStatus]
  );

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
        // 直播回放驳回 = 真删录像文件（主播本人也不能再回看），文案必须说清楚
        desc: items.find((x) => x.id === id)?.source === 'live'
          ? '这是直播回放。驳回后录像文件会被直接清理，主播本人也无法再回看，且不可恢复。'
          : '驳回后该文件将不对会员展示，上传者可在「我的媒体」中看到驳回原因。',
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
          const r = await apiPost<{ purgedLive?: boolean }>(`/admin/media/${id}/review`, { action: 'reject', reason });
          notice.success(r?.purgedLive ? '已驳回，直播录像已清理' : '已驳回');
          reload();
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

  /**
   * 重新跑一遍媒体流水线：转码失败修复后、或调整过转码配置需要重出封面/时长时使用。
   */
  async function reprocess(id: string) {
    setBusy(id);
    setMsg('');
    try {
      const r = await apiPost<{ ffmpeg: boolean }>(`/admin/media/${id}/reprocess`, {});
      if (r?.ffmpeg === false) {
        setMsg('已重试：当前环境未安装 ffmpeg，仅完成了元数据补探');
      } else {
        setMsg('已重新执行处理流水线');
        notice.success('处理流水线已重跑');
      }
      reload();
    } catch (e: any) {
      setMsg(e?.message || '重新处理失败');
      notice.error(e?.message || '重新处理失败');
    } finally {
      setBusy(null);
    }
  }

  const items = data?.items || [];
  const t = data?.totals;
  // 手里已有数据时不再整页换成「加载中…」：刷新会把表格抹成一行字再弹回来
  const refreshing = loading && data != null;
  // 「重新处理」那条接口是 requireRole(['admin'])，审核员点一下必然 403
  const isAdmin = user?.role === 'admin';

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="媒体中心只对媒体模块审核员与管理员开放，请先用管理账号登录。" href="/login?next=/admin/media" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要媒体模块的审核员或管理员账号，才能查看文件、转码任务与回收站。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead eyebrow="内容 · 媒体" title="媒体中心" sub="上传审核、文件、转码任务、失败任务与回收站" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6" data-reveal-group>
        <StatCard title="文件总数" value={t?.files ?? '—'} hint={`占用 ${formatSize(t?.bytes || 0)}`} />
        <StatCard title="待审核" value={t?.pendingReview ?? 0} />
        <StatCard title="转码中" value={t?.transcoding ?? 0} />
        <StatCard title="失败任务" value={t?.failedTasks ?? 0} />
        <StatCard title="回收站" value={t?.trashed ?? 0} />
      </div>

      <Toolbar>
        <input className="input-styled input-sm min-h-11 lg:min-h-0 flex-1 min-w-[200px]" aria-label="搜索标题 / 文件名" placeholder="搜索标题 / 文件名" value={q} onChange={(e) => setQ(e.target.value)} />
        <AdminSelect
          value={reviewStatus}
          label="按审核状态筛选"
          onChange={setReviewStatus}
          options={[
            { value: '', label: '全部审核状态' },
            { value: 'pending', label: '待审核' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已驳回' },
          ]}
        />
        <AdminSelect
          value={kind}
          label="按媒体类型筛选"
          onChange={setKind}
          options={[
            { value: '', label: '全部类型' },
            ...Object.entries(MEDIA_KIND_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <AdminSelect
          value={status}
          label="按处理状态筛选"
          onChange={setStatus}
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(STATUS_MAP).map(([value, v]) => ({ value, label: v.label })),
          ]}
        />
      </Toolbar>

      {msg ? <div role="status" className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}

      {loading && !data ? (
        <TableSkeleton cols={7} />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || items.length === 0 ? (
        <Empty label="暂无文件" hint="换个关键词，或把审核状态 / 类型 / 处理状态改回「全部」再试" />
      ) : (
        <div className={`glass rounded-2xl overflow-hidden shadow-soft hair-top transition-opacity duration-300 ${refreshing ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto scroll-slim">
            {/* 「操作」列改成 .btn-chip 后自然宽度涨到约 1150，
                给它一个 min-w 兜底：窄屏横向滚动，而不是把格子压到换行 */}
            <table className="w-full min-w-[1150px] text-sm">
              <caption className="sr-only">媒体中心</caption>
              <thead className="bg-ink-50 text-ink-600">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">文件</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">类型</th>
                  <th scope="col" className="text-right px-4 py-3 font-medium">大小</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">任务</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">处理</th>
                  <th scope="col" className="text-center px-4 py-3 font-medium">审核</th>
                  <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-t border-ink-100 hover:bg-primary-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900 line-clamp-1 max-w-[240px]">{m.title || m.fileName}</div>
                      <div className="text-xs text-ink-400">{m.owner || '系统'} · {formatDate(m.createdAt) || '—'} · 引用{m.refCount}</div>
                      {/* 直播回放与普通上传混在一张表里，管理员看不出哪个能驳回删文件 */}
                      {m.source === 'live' && m.sourceRef ? (
                        <Link href={`/live/${m.sourceRef}`} target="_blank" className="inline-block text-xs text-primary-600 hover:underline mt-0.5">
                          直播回放 · 查看直播间 →
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3"><Badge tone="primary">{mediaKindLabel(m.kind)}</Badge></td>
                    <td className="px-4 py-3 text-right text-ink-600">{formatSize(m.sizeBytes)}</td>
                    <td className="px-4 py-3 text-center text-ink-600">
                      {m.taskCount > 0 ? `${m.taskCount} 项` : '—'}
                      {m.taskFailed > 0 ? <span className="text-rose-600 text-xs ml-1">失败{m.taskFailed}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-center"><Badge tone={STATUS_MAP[m.status]?.tone || 'gray'}>{STATUS_MAP[m.status]?.label || m.status}</Badge></td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={REVIEW_MAP[m.reviewStatus]?.tone || 'gray'}>{REVIEW_MAP[m.reviewStatus]?.label || m.reviewStatus}</Badge>
                      {m.reviewStatus === 'rejected' && m.reviewReason ? (
                        <div className="text-[11px] text-rose-600 mt-1 line-clamp-1 max-w-[160px]" title={m.reviewReason}>{m.reviewReason}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {/* 原来是四个纯文字链接：热区只有十几像素高，而且"删除"和"重新处理"
                          看起来权重一样。统一成 .btn-chip 后危险操作用红、放行用绿 */}
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {isAdmin ? (
                          <button
                            disabled={busy === m.id}
                            onClick={() => reprocess(m.id)}
                            className="btn-chip"
                            title="重新执行转码/封面/时长探测流水线"
                          >
                            重新处理
                          </button>
                        ) : null}
                        {m.reviewStatus === 'pending' ? (
                          <>
                            <button disabled={busy === m.id} onClick={() => review(m.id, 'approve')} className="btn-chip btn-chip-safe">通过</button>
                            <button disabled={busy === m.id} onClick={() => review(m.id, 'reject')} className="btn-chip btn-chip-danger">驳回</button>
                          </>
                        ) : null}
                        {m.status === 'trashed' ? (
                          <button disabled={busy === m.id} onClick={() => act(m.id, 'restore')} className="btn-chip btn-chip-safe">恢复</button>
                        ) : (
                          <button disabled={busy === m.id} onClick={() => act(m.id, 'trash')} className="btn-chip btn-chip-danger">删除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
