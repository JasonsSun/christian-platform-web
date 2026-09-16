'use client';

import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { AdminLayout, Badge, Loading, Empty, ErrorBox, SectionTitle } from '../_components';

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

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">系统信息</h1>
        <button className="btn-secondary" onClick={reload}>刷新</button>
      </div>

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
              <Badge tone={data.status === 'UP' ? 'green' : 'red'}>{data.status}</Badge>
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
              <InfoRow label="服务时间" value={data.time} />
            </div>
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
