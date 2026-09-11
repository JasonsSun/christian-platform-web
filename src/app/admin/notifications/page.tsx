'use client';

import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface NotifData {
  totals: { total: number; unread: number; templates: number };
  templates: { id: string; code: string; channel: string; titleTpl: string; bodyTpl: string; enabled: boolean }[];
  byType: { type: string; c: number; unread: number }[];
  byChannel: { channel: string; c: number; enabled: number }[];
  recent: { id: string; type: string; title: string; body: string; read: boolean; createdAt: string; user: string }[];
}

const CHANNEL_LABEL: Record<string, string> = { inapp: '站内', push: '推送', email: '邮件', sms: '短信' };

export default function AdminNotificationsPage() {
  const { data, loading, error, reload } = useApi<NotifData>('/admin/notifications', []);

  return (
    <AdminLayout>
      <SectionTitle>通知中心</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">通知模板、任务、渠道与收发统计</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="通知总数" value={data?.totals.total ?? '—'} />
        <StatCard title="未读" value={data?.totals.unread ?? 0} />
        <StatCard title="模板数" value={data?.totals.templates ?? 0} />
      </div>

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">通知模板</div>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">编码</th>
                  <th className="text-left px-4 py-3 font-medium">渠道</th>
                  <th className="text-left px-4 py-3 font-medium">标题模板</th>
                  <th className="text-center px-4 py-3 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {(data?.templates || []).map((t) => (
                  <tr key={t.id} className="border-t border-ink-100">
                    <td className="px-4 py-3 font-mono text-xs text-primary-700">{t.code}</td>
                    <td className="px-4 py-3"><Badge tone="primary">{CHANNEL_LABEL[t.channel] || t.channel}</Badge></td>
                    <td className="px-4 py-3 text-ink-700">{t.titleTpl}</td>
                    <td className="px-4 py-3 text-center">
                      {t.enabled ? <Badge tone="green">启用</Badge> : <Badge tone="gray">停用</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-4 shadow-soft">
              <div className="font-medium text-ink-700 mb-3">按类型分布</div>
              {(data?.byType || []).length === 0 ? <Empty label="暂无数据" /> : (
                <ul className="space-y-2 text-sm">
                  {(data?.byType || []).map((t) => (
                    <li key={t.type} className="flex items-center justify-between">
                      <span className="text-ink-600">{t.type}</span>
                      <span className="text-ink-900 font-medium">{t.c}<span className="text-ink-400 text-xs"> · 未读{t.unread}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="glass rounded-2xl p-4 shadow-soft">
              <div className="font-medium text-ink-700 mb-3">渠道统计</div>
              <ul className="space-y-2 text-sm">
                {(data?.byChannel || []).map((c) => (
                  <li key={c.channel} className="flex items-center justify-between">
                    <span className="text-ink-600">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                    <span className="text-ink-900 font-medium">{c.c} 个模板 · 启用{c.enabled}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">最近通知</div>
            {(data?.recent || []).length === 0 ? <Empty label="暂无通知" /> : (
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">接收人</th>
                    <th className="text-left px-4 py-3 font-medium">标题</th>
                    <th className="text-left px-4 py-3 font-medium">时间</th>
                    <th className="text-center px-4 py-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent || []).map((r) => (
                    <tr key={r.id} className="border-t border-ink-100">
                      <td className="px-4 py-3 text-ink-600">{r.user || '—'}</td>
                      <td className="px-4 py-3 text-ink-900">{r.title}<div className="text-xs text-ink-400">{r.body}</div></td>
                      <td className="px-4 py-3 text-ink-500">{r.createdAt?.slice(0, 16).replace('T', ' ')}</td>
                      <td className="px-4 py-3 text-center">{r.read ? <Badge tone="gray">已读</Badge> : <Badge tone="gold">未读</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
