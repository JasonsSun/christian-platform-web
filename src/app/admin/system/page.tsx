'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { channelLabel, notifJobReasonLabel, notifJobStatusLabel, notifTypeLabel } from '@/lib/notificationMeta';
import { AdminLayout, Badge, Loading, Empty, ErrorBox, SectionTitle, PageHead, Panel, AccessState } from '../_components';

interface HealthData {
  status: string;
  database: { engine: string; version: string; schema: string };
  counts: { users: number; contents: number; activities: number; songs: number; verses: number; notifications: number };
  time: string;
}

const TECH_STACK = [
  'Next.js 14 App Router 提供 API 路由与前端渲染',
  'MySQL 8 作为主数据库，承载用户、内容、活动、团契等核心数据',
  'JWT（Access + Refresh 双令牌）负责身份认证与会话管理',
  'RBAC 基于角色的访问控制（member / moderator / admin）',
  '事务性发件箱（Transactional Outbox）保证业务操作与通知最终一致',
  '审计日志（Audit Log）记录关键操作，便于追溯与合规',
];

const ENV_TIPS = [
  '生产环境建议接入病毒扫描服务，对用户上传的媒体文件进行安全检测',
  '建议配置媒体转码流水线，统一处理图片 / 音视频的压缩与多分辨率输出',
  '推送通道（站内通知 / 邮件 / 移动推送）应独立部署并做限流与重试',
  '数据库定期备份与慢查询监控，敏感操作需开启双因素认证',
];

interface ErrorEntry {
  at: string;
  level: string;
  message: string;
  ctx: { scope?: string; userId?: string; [k: string]: unknown };
}

/** 外发通知队列状态（GET /admin/notify） */
interface NotifyInfo {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  byChannel: { status: string; channel: string; n: number }[];
  channels: { email: boolean; wechat: boolean; sms: boolean };
  recent: {
    id: string;
    user_id: string;
    channel: string;
    kind: string;
    title: string;
    status: string;
    reason: string | null;
    attempts: number;
    created_at: string;
  }[];
}

export default function AdminSystemPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<HealthData>('/health');
  // 错误日志接口仅管理员可见（审核员调会 403），所以用 null path 跳过请求
  const isAdmin = user?.role === 'admin';
  const {
    data: errData,
    loading: errLoading,
    reload: reloadErrors,
  } = useApi<{ items: ErrorEntry[]; monitor: boolean }>(isAdmin ? '/admin/errors?limit=50' : null, [isAdmin]);

  /* ---------- 外发通知队列（该接口原先没有任何 UI 挂载） ---------- */
  const [notifyData, setNotifyData] = useState<NotifyInfo | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [flushBusy, setFlushBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');

  const loadNotify = async () => {
    setNotifyLoading(true);
    try {
      setNotifyData(await apiGet<NotifyInfo>('/admin/notify?limit=8'));
    } catch (e: any) {
      setNotifyMsg(e?.message || '通知队列状态加载失败');
    } finally {
      setNotifyLoading(false);
    }
  };

  useEffect(() => {
    void loadNotify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushQueue = async () => {
    setFlushBusy(true);
    setNotifyMsg('');
    try {
      const r = await apiPost<{ scanned: number; sent: number; failed: number; skipped: number; deferred: number }>(
        '/admin/notify?limit=50',
        {}
      );
      setNotifyMsg(`已冲刷：扫描 ${r.scanned} / 成功 ${r.sent} / 失败 ${r.failed} / 跳过 ${r.skipped} / 顺延 ${r.deferred}`);
      await loadNotify();
    } catch (e: any) {
      setNotifyMsg(e?.message || '冲刷失败');
    } finally {
      setFlushBusy(false);
    }
  };

  if (authLoading) return <AdminLayout><Loading rows={3} /></AdminLayout>;
  if (user === null)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="登录审核员或管理员账号后查看系统信息。" href="/login" />
      </AdminLayout>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要审核员或管理员角色。" />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="系统 · 运维"
        title="系统信息"
        actions={<button className="btn-secondary btn-sm min-h-11 lg:min-h-0" onClick={reload}>刷新</button>}
      />

      {/* 健康检查 */}
      <div className="glass rounded-2xl p-5 shadow-soft mb-6">
        <SectionTitle>服务状态</SectionTitle>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !data ? (
          <Empty label="暂无数据" />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-ink-500">运行状态：</span>
              <Badge tone={data.status === 'UP' ? 'green' : 'red'}>{data.status === 'UP' ? '正常' : '异常'}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <InfoRow label="数据库引擎" value={data.database.engine} />
              <InfoRow label="数据库版本" value={data.database.version} />
              <InfoRow label="数据库名" value={data.database.schema} />
              <InfoRow label="用户数" value={data.counts.users} />
              <InfoRow label="内容数" value={data.counts.contents} />
              <InfoRow label="活动数" value={data.counts.activities} />
              <InfoRow label="诗歌数" value={data.counts.songs} />
              <InfoRow label="经文数" value={data.counts.verses} />
              <InfoRow label="通知数" value={data.counts.notifications} />
              <InfoRow label="服务时间" value={formatDateTime(data.time) || data.time} />
            </div>
          </>
        )}
      </div>

      {/* 外发通知队列运维 */}
      <div className="glass rounded-2xl p-5 shadow-soft mb-6">
        <div className="flex items-center justify-between">
          <SectionTitle>外发通知队列</SectionTitle>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={loadNotify} disabled={notifyLoading}>刷新</button>
            <button className="btn-primary btn-sm" onClick={flushQueue} disabled={flushBusy} aria-busy={flushBusy}>冲刷队列</button>
          </div>
        </div>
        <p className="text-xs text-ink-400 mb-4">
          生产环境由定时任务调用同一接口自动冲刷；队列堆积时可在后台手动跑一轮。
        </p>

        {notifyMsg ? <div role="status" className="mb-3 text-xs text-ink-600 bg-ink-50 rounded-xl px-3 py-2">{notifyMsg}</div> : null}

        {!notifyData ? (
          notifyLoading ? <Loading /> : <Empty label="暂无数据" />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                { label: '待发送', value: notifyData.pending },
                { label: '已发送', value: notifyData.sent },
                { label: '失败', value: notifyData.failed },
                { label: '跳过', value: notifyData.skipped },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-ink-50 px-3 py-2">
                  <div className="text-xs text-ink-500">{s.label}</div>
                  <div className="text-lg font-semibold text-ink-900">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
              <span className="text-ink-500">通道就绪：</span>
              {Object.entries(notifyData.channels || {}).map(([k, v]) => (
                <Badge key={k} tone={v ? 'green' : 'gray'}>
                  {channelLabel(k)}
                  {v ? ' 已配置' : ' 未配置'}
                </Badge>
              ))}
            </div>

            {notifyData.recent?.length ? (
              /* 原来是 overflow-hidden：窄屏下整张表被裁掉且滚不动，全站 15 张后台表都用 overflow-x-auto */
              <div className="rounded-xl border border-ink-100 overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <caption className="sr-only">外发通知队列</caption>
                  <thead className="bg-ink-50 text-ink-600">
                    <tr>
                      <th scope="col" className="text-left px-3 py-2 font-medium">通道</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">类型</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">标题</th>
                      <th scope="col" className="text-center px-3 py-2 font-medium">状态</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">原因</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifyData.recent.map((j) => (
                      <tr key={j.id} className="border-t border-ink-100">
                        <td className="px-3 py-2">{channelLabel(j.channel)}</td>
                        <td className="px-3 py-2">
                          {/* 中文给人读，code 留给排障：与事件中心同一套呈现 */}
                          <div className="text-ink-700">{notifTypeLabel(j.kind)}</div>
                          <div className="font-mono text-[11px] text-ink-400">{j.kind}</div>
                        </td>
                        <td className="px-3 py-2 text-ink-700 line-clamp-1 max-w-[220px]">{j.title}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge tone={j.status === 'sent' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'skipped' ? 'gold' : 'gray'}>
                            {notifJobStatusLabel(j.status)}
                          </Badge>
                        </td>
                        {/* 队列里绝大多数是 skipped，不给原因就等于让管理员猜为什么没发出去 */}
                        <td className="px-3 py-2 text-ink-500 max-w-[200px] truncate" title={notifJobReasonLabel(j.reason) || undefined}>
                          {notifJobReasonLabel(j.reason) || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-ink-400 whitespace-nowrap">
                          {/* created_at 带 Z，slice 会把 UTC 墙上时间直接印出来，比本机时间差 8 小时 */}
                          {formatDateTime(j.created_at) || j.created_at}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* 最近错误（仅管理员） */}
      {isAdmin && (
        <div className="glass rounded-2xl p-5 shadow-soft mb-6">
          <div className="flex items-center justify-between">
            <SectionTitle>最近错误（进程内最近 100 条）</SectionTitle>
            <button className="btn-secondary text-xs" onClick={reloadErrors}>刷新</button>
          </div>
          {errLoading ? (
            <Loading />
          ) : !errData?.items?.length ? (
            <Empty label="当前没有捕获到错误" />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {errData.items.map((e, i) => (
                <div key={`${e.at}-${i}`} className="rounded-xl bg-ink-50 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={e.level === 'error' ? 'red' : e.level === 'warn' ? 'gold' : 'gray'}>{e.level}</Badge>
                    <span className="text-ink-400">{new Date(e.at).toLocaleString('zh-CN')}</span>
                    {e.ctx?.scope && <span className="text-ink-500">scope: {e.ctx.scope}</span>}
                  </div>
                  <p className="text-sm text-ink-800 mt-1 break-words whitespace-pre-wrap">{e.message}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-400 mt-3">
            错误只在进程内存中保留，重启即清空；需要长期留存请配置 <code>SENTRY_DSN</code> 接入外部监控。
          </p>
        </div>
      )}

      {/* 技术栈 */}
      <div className="glass rounded-2xl p-5 shadow-soft mb-6">
        <SectionTitle>技术栈说明</SectionTitle>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-700">
          {TECH_STACK.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      {/* 运行环境提示 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <SectionTitle>运行环境提示</SectionTitle>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-700">
          {ENV_TIPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-ink-50 px-4 py-3">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-ink-800 font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}
