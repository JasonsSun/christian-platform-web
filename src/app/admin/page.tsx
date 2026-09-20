'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { contentStatusLabel, auditActionLabel } from '@/lib/labels';
import { AdminLayout, StatCard, StatusBadge, Loading, Empty, ErrorBox, SectionTitle, Badge } from './_components';
import type { AdminStats } from './_components';

/** 状态条的颜色按归一化后的状态取：接口里 pending_review 和 pending 是同义，
 *  只按一个键查会让「待审核」画成蓝色，而同一页别处它是金色。 */
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-ink-400',
  pending: 'bg-gold-500',
  pending_review: 'bg-gold-500',
  published: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  active: 'bg-emerald-500',
  suspended: 'bg-rose-500',
};

/** 增长图永远给满 7 个槽位：只画接口回来的那几天，柱子会随数据缺失变宽变窄，
 *  全零时更是整块塌成一句「暂无数据」的空虚线框。 */
function last7Days() {
  const out: { key: string; md: string }[] = [];
  const base = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(base);
    dt.setDate(base.getDate() - i);
    out.push({
      key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      md: `${dt.getMonth() + 1}/${dt.getDate()}`,
    });
  }
  return out;
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<AdminStats>('/admin/stats');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    if (data) setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  }, [data]);

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  if (user.role !== 'moderator' && user.role !== 'admin')
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;

  // 手里已经有一屏数据时不再整页换成「加载中…」：刷新会把 6 张卡抹成一行字再弹回来
  const refreshing = loading && data != null;
  if (loading && !data) return <AdminLayout><Loading /></AdminLayout>;
  if (error && !data) return <AdminLayout><ErrorBox message={error} onRetry={reload} /></AdminLayout>;
  if (!data) return <AdminLayout><Empty label="暂无数据" hint="统计接口没有返回内容，可稍后重试" /></AdminLayout>;

  const t = data.totals;
  const byDay = new Map<string, number>((data.growth || []).map((g) => {
    const raw = String(g.d);
    return [raw.length > 10 ? raw.slice(0, 10) : raw, g.c] as [string, number];
  }));
  const series = last7Days().map((d) => ({ ...d, c: byDay.get(d.key) ?? byDay.get(d.key.slice(5)) ?? 0 }));
  const growthTotal = series.reduce((s, x) => s + x.c, 0);
  const maxGrowth = Math.max(1, ...series.map((g) => g.c));
  const maxStatus = Math.max(1, ...data.byStatus.map((s) => s.c));
  const statusTotal = data.byStatus.reduce((s, x) => s + x.c, 0);

  return (
    <AdminLayout>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink-900">仪表盘</h1>
          <p className="text-xs text-ink-500 mt-1">
            {refreshing ? '正在刷新…' : updatedAt ? `数据更新于 ${updatedAt}` : '数据快照'}
          </p>
        </div>
        <button className="btn-secondary btn-sm shrink-0" onClick={reload} disabled={loading}>刷新</button>
      </div>

      {/* 核心指标卡：整卡可点直达对应管理页 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-8">
        <StatCard title="用户数" value={t.users} hint={`封禁 ${t.suspended}`} href="/admin/users" />
        <StatCard title="已发布内容" value={t.published} hint={`总计 ${t.contents}`} href="/admin/contents" />
        <StatCard
          title="待审核"
          value={t.pendingTasks}
          hint={t.pendingTasks > 0 ? '点此处理' : '已清空'}
          href="/admin/reviews"
          accent={t.pendingTasks > 0}
        />
        <StatCard title="活动数" value={t.activities} hint={`待审 ${t.pendingEvents}`} href="/admin/activities" />
        <StatCard title="报名数" value={t.registrations} href="/admin/checkins" />
        <StatCard title="团契数" value={t.groupCount} href="/admin/groups" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-8">
        {/* 内容状态分布 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>内容状态分布</SectionTitle>
            <span className="text-xs text-ink-500 -mt-4">共 {statusTotal} 篇</span>
          </div>
          {data.byStatus.length === 0 ? (
            <Empty label="暂无内容" href="/admin/contents" hrefLabel="去内容管理" />
          ) : (
            <div className="flex flex-col gap-3">
              {data.byStatus.map((s) => {
                const tone = STATUS_TONE[s.status] || 'bg-primary-500';
                return (
                  <div key={s.status} className="flex items-center gap-3">
                    <div className="w-20 flex-shrink-0 flex items-center gap-1.5 text-sm text-ink-600">
                      <span className={`w-2 h-2 rounded-full ${tone}`} aria-hidden="true" />
                      {contentStatusLabel(s.status)}
                    </div>
                    <div className="flex-1 h-3 rounded-full bg-ink-100 overflow-hidden" aria-hidden="true">
                      <div className={`h-full ${tone}`} style={{ width: `${(s.c / maxStatus) * 100}%` }} />
                    </div>
                    <div className="w-12 text-right text-sm font-semibold text-ink-700">{s.c}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 近 7 天用户增长 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>近 7 天用户增长</SectionTitle>
            <span className="text-xs text-ink-500 -mt-4">
              合计 {growthTotal} · 日均 {(growthTotal / 7).toFixed(1)}
            </span>
          </div>
          {/* 全零时柱子只剩基线上 3px 的一排灰点，中间空出一整块高度看着像渲染坏了：
              把说明搬进绘图区正中占住这块高度，卡片高度不变，两种数据状态版式一致。 */}
          <div className="relative">
            <div
              className="flex items-end gap-2 h-40"
              role="img"
              aria-label={
                growthTotal === 0
                  ? '近 7 天没有新增注册'
                  : `近 7 天新增 ${growthTotal} 人，单日最高 ${Math.max(...series.map((x) => x.c))} 人`
              }
            >
              {series.map((g) => (
                <div key={g.key} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  <div className={`text-xs ${g.c ? 'text-ink-600' : 'text-ink-300'}`} aria-hidden="true">{g.c}</div>
                  <div
                    className={`w-full rounded-t ${g.c ? 'bg-primary-500' : 'bg-ink-100'}`}
                    style={{ height: g.c ? `${(g.c / maxGrowth) * 100}%` : 3 }}
                    title={`${g.key}: ${g.c}`}
                    aria-hidden="true"
                  />
                  <div className="text-[10px] text-ink-400" aria-hidden="true">{g.md}</div>
                </div>
              ))}
            </div>
            {growthTotal === 0 ? (
              <p className="absolute inset-x-0 top-[38%] px-2 text-center text-xs text-ink-500">
                近 7 天没有新注册，平台冷启动阶段属正常
                <Link href="/admin/users" className="text-primary-600 hover:underline ml-1 py-3 -my-3">看用户管理</Link>
                的存量构成
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* 最近审计日志：只留 6 条 + 入口，不再套一层内滚动 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>最近审计日志</SectionTitle>
            <Link href="/admin/audit" className="text-sm text-primary-600 whitespace-nowrap py-1.5 -my-1.5 hover:underline">
              查看全部 →
            </Link>
          </div>
          {data.recentAudit.length === 0 ? (
            <Empty label="暂无审计日志" />
          ) : (
            <ul className="flex flex-col gap-1">
              {data.recentAudit.slice(0, 6).map((a) => {
                const label = auditActionLabel(a.action);
                const known = label !== a.action;
                // 未映射的动作码不再给醒目蓝徽章：读屏会念出一串动作码，眼睛以为它是中文标签
                const ip = String(a.ip || '').replace(/^::ffff:/, '');
                // 匿名/系统动作没有 actor，直接拼 `actor · 时间 · ip` 会留一个悬空的分隔符
                const meta = [a.actor_name, timeAgo(a.created_at), ip].filter(Boolean).join(' · ');
                return (
                  <li key={a.id} className="flex items-start gap-3 text-sm border-b border-ink-100 last:border-0 pb-2 last:pb-0">
                    <span className="w-20 flex-shrink-0">
                      <Badge tone={known ? 'blue' : 'gray'}>{label}</Badge>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-ink-700 truncate">{a.detail || a.entity_type}</div>
                      <div className="text-xs text-ink-400">{meta}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 热门内容 Top8 */}
        <div className="glass rounded-2xl p-5 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>热门内容 Top8</SectionTitle>
            <Link href="/admin/contents" className="text-sm text-primary-600 whitespace-nowrap py-1.5 -my-1.5 hover:underline">
              内容管理 →
            </Link>
          </div>
          {data.topContent.length === 0 ? (
            <Empty label="暂无内容" />
          ) : (
            <ol className="flex flex-col">
              {data.topContent.slice(0, 8).map((c, i) => (
                <li key={c.id}>
                  <Link
                    href={`/contents/${c.id}`}
                    className="flex items-center gap-3 text-sm rounded-xl px-2 -mx-2 py-2 -my-0.5 hover:bg-primary-50 transition group"
                  >
                    <span className="w-5 flex-shrink-0 text-center font-bold text-ink-400">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-ink-800 truncate group-hover:text-primary-700">{c.title}</div>
                      {/* ♥/👁/💬 三个 emoji 在表格里既花又不等价于文字（不同系统字体会掉字），
                          直接写成「150 赞」这类短词，读屏也不用再补 sr-only */}
                      <div className="text-xs text-ink-400 inline-flex items-center gap-2.5">
                        <span>{c.like_count} 赞</span>
                        <span>{c.view_count} 浏览</span>
                        <span>{c.comment_count} 评论</span>
                      </div>
                    </div>
                    {/* 榜单里 8 行全是「已发布」时这枚徽章只是噪声，只留异常状态 */}
                    {c.status !== 'published' ? <StatusBadge status={c.status} /> : null}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
