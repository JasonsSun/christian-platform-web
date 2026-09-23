'use client';

import { useId, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPatch } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import { formatDateTime, formatSize } from '@/lib/format';
import { backupKindLabel } from '@/lib/labels';
import { canEnterAdmin, AdminLayout, Loading, ErrorBox, Empty, Badge, PageHead, Panel, AccessState } from '../_components';
import Portal from '@/components/Portal';

interface BackupFile {
  name: string;
  size: number;
  mtime: string;
  kind: 'sql.gz' | 'json';
  source: 'cron' | 'app';
  createdBy?: string;
}

export default function AdminBackupsPage() {
  const { user, loading: authLoading } = useAuth();
  // /admin/backups 的读、写、恢复、删除四处全是 requireRole(['admin'])。
  // 原来这里只挡「登录了但角色不对」，匿名与普通成员照样先发一趟必然 401 的请求，
  // 页面上是一句红色「未登录或令牌无效」加一个重试按钮。
  const canSee = canEnterAdmin(user, '/admin/backups');
  const { data, loading, error, reload } = useApi<{ files: BackupFile[]; cron: { schedule: string; note: string }; lastBackupAt: string | null; lastAppBackupAt: string | null }>(
    canSee ? '/admin/backups' : null,
    [canSee]
  );
  const createAction = useAction();
  const delAction = useAction();
  const restoreAction = useAction();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{ inserted: number } | null>(null);

  // Esc 与焦点管理：判据同遮罩点击，请求进行中不许关；这些 hook 必须在下面的
  // 权限/加载早返回之前调用，否则早返回那一轮少掉的 hook 会让 React 直接报错。
  useEscape(!!confirmDel, () => {
    if (!delAction.pending) setConfirmDel(null);
  });
  const delRef = useDialogFocus(!!confirmDel);
  const delTitleId = useId();
  useEscape(!!confirmRestore, () => {
    if (!restoreAction.pending) setConfirmRestore(null);
  });
  const restoreRef = useDialogFocus(!!confirmRestore);
  const restoreTitleId = useId();

  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="备份管理只对平台管理员开放，请先用管理员账号登录。" href="/login?next=/admin/backups" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="备份的创建、恢复与删除仅限平台管理员，且每一次操作都会记入审计日志。" />
      </AdminLayout>
    );
  if (loading) return <AdminLayout><Loading /></AdminLayout>;
  if (error) return <AdminLayout><ErrorBox message={error} onRetry={reload} /></AdminLayout>;
  if (!data) return <AdminLayout><Empty label="暂无数据" /></AdminLayout>;

  const files = data.files || [];

  async function doCreate() {
    const r = await createAction.run(() => apiPost<{ name: string; size: number; rowCount: number }>('/admin/backups'));
    if (r) {
      reload();
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    const r = await delAction.run(() => apiDelete(`/admin/backups?name=${encodeURIComponent(confirmDel)}`));
    if (r) {
      setConfirmDel(null);
      reload();
    }
  }

  async function doRestore() {
    if (!confirmRestore) return;
    const r = await restoreAction.run(() =>
      apiPatch<{ tables: number; inserted: number }>(`/admin/backups?name=${encodeURIComponent(confirmRestore)}`, {})
    );
    if (r) {
      setRestoreInfo(r);
      setConfirmRestore(null);
    }
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="系统 · 运维"
        title="备份管理"
        sub="数据库逻辑备份的查看、下载、恢复与清理"
        actions={
          <button onClick={doCreate} disabled={createAction.pending} className="btn-primary min-h-11 lg:min-h-0 px-5 disabled:opacity-70">
            {createAction.pending ? '备份中…' : '立即备份'}
          </button>
        }
      />

      <div className="space-y-6">
        {/* 自动备份说明 */}
        <Panel title="自动备份" as="h2">
          <p className="text-sm text-ink-600 leading-relaxed">
            <span className="font-semibold text-ink-800">宿主机 cron 定时任务</span>
            （<span className="num">{data.cron.schedule}</span>）每日执行 <code className="px-1 rounded bg-ink-100">deploy/backup.sh</code> 生成 <code className="px-1 rounded bg-ink-100">*.sql.gz</code> 全量备份（mysqldump）。
          </p>
          <p className="mt-1.5 text-xs text-ink-400">{data.cron.note}</p>
          {data.lastBackupAt && (
            <p className="mt-1.5 text-xs text-ink-500">最近一次备份：<span className="num">{formatDateTime(data.lastBackupAt)}</span></p>
          )}
        </Panel>

        {createAction.error && <p className="text-sm text-rose-600">{createAction.error}</p>}

        <Panel title={`备份文件（${files.length}）`}>
          {files.length === 0 ? (
            <Empty label="还没有备份文件" hint="点击右上角「立即备份」创建一份" />
          ) : (
            <div className="divide-y divide-ink-100">
              {files.map((f) => (
                <div key={f.name} className="py-3.5 flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-medium text-ink-900 text-sm truncate">{f.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge tone={f.kind === 'sql.gz' ? 'blue' : 'primary'}>{backupKindLabel(f.kind)}</Badge>
                      <Badge tone={f.source === 'app' ? 'green' : 'gray'}>{f.source === 'app' ? '应用备份' : '自动备份'}</Badge>
                      <span className="num text-xs text-ink-400">{formatSize(f.size)}</span>
                      <span className="num text-xs text-ink-400">· {formatDateTime(f.mtime) || '时间未知'}</span>
                    </div>
                  </div>
                  <div className="inline-flex flex-wrap items-center justify-end gap-1 shrink-0">
                    <a
                      href={`/api/v1/admin/backups/${encodeURIComponent(f.name)}`}
                      aria-label={`下载备份 ${f.name}`}
                      className="btn-chip"
                    >
                      下载
                    </a>
                    {f.kind === 'json' && (
                      <button onClick={() => setConfirmRestore(f.name)} className="btn-chip btn-chip-safe">
                        恢复
                      </button>
                    )}
                    <button onClick={() => setConfirmDel(f.name)} className="btn-chip btn-chip-danger">
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <p className="text-xs text-ink-400 leading-relaxed">
          提示：<code className="px-1 rounded bg-ink-100">*.sql.gz</code> 由运维通过 mysqldump 恢复；<code className="px-1 rounded bg-ink-100">*.json</code> 应用备份可通过上方「恢复」回灌（INSERT IGNORE，只补不覆盖已有数据）。
        </p>
      </div>

      {/* 删除确认 */}
      {confirmDel && (
        <Portal>
          <div ref={delRef} data-guard="backup-delete" role="dialog" aria-modal="true" aria-labelledby={delTitleId} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }}>
            <div className="bg-white rounded-2xl shadow-card-hover max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 id={delTitleId} className="font-display text-lg font-bold text-ink-900 mb-2">删除备份</h3>
              <p className="text-sm text-ink-500 mb-4">
                确定删除备份文件 <span className="font-mono text-ink-800">{confirmDel}</span> 吗？此操作不可恢复。
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDel(null)} className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition">取消</button>
                <button onClick={doDelete} disabled={delAction.pending} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition disabled:opacity-50">
                  {delAction.pending ? '删除中…' : '确认删除'}
                </button>
              </div>
              {delAction.error && <p className="text-rose-600 text-xs mt-2 text-center">{delAction.error}</p>}
            </div>
          </div>
        </Portal>
      )}

      {/* 恢复确认 */}
      {confirmRestore && (
        <Portal>
          <div ref={restoreRef} data-guard="backup-restore" role="dialog" aria-modal="true" aria-labelledby={restoreTitleId} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }}>
            <div className="bg-white rounded-2xl shadow-card-hover max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 id={restoreTitleId} className="font-display text-lg font-bold text-ink-900 mb-2">恢复备份</h3>
              <p className="text-sm text-ink-500 mb-4">
                将 <span className="font-mono text-ink-800">{confirmRestore}</span> 的数据回灌到数据库。采用 INSERT IGNORE，<span className="text-gold-700 font-semibold">只补充缺失数据，不会覆盖现有记录</span>。建议恢复前先做一次新备份。
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmRestore(null)} className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition">取消</button>
                <button onClick={doRestore} disabled={restoreAction.pending} className="flex-1 py-2.5 rounded-xl bg-gold-500 text-ink-950 text-sm font-semibold hover:bg-gold-600 transition disabled:opacity-50">
                  {restoreAction.pending ? '恢复中…' : '确认恢复'}
                </button>
              </div>
              {restoreAction.error && <p className="text-rose-600 text-xs mt-2 text-center">{restoreAction.error}</p>}
              {restoreInfo && !restoreAction.error && (
                <p className="text-emerald-600 text-xs mt-2 text-center">已回灌 {restoreInfo.inserted} 条缺失数据</p>
              )}
            </div>
          </div>
        </Portal>
      )}
    </AdminLayout>
  );
}
