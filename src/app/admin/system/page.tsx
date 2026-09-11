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

export default function AdminSystemPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<HealthData>('/health');

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
