'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatClock, timeAgo } from '@/lib/format';
import { contentStatusLabel, auditActionLabel } from '@/lib/labels';
import { IconArrowRight, IconChatDots, IconEye, IconHeart, IconRefresh } from '@/components/icons';
import { canEnterAdmin, AdminLayout, PageHead, StatCard, StatusBadge, Loading, Empty, ErrorBox, SectionTitle, Badge, AccessState } from './_components';
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
  // /admin/stats 是 requireRole(['admin','moderator'])：匿名进来先撞一趟必然 401 的请求。
  const canSee = canEnterAdmin(user, '/admin');
  const { data, loading, error, reload } = useApi<AdminStats>(canSee ? '/admin/stats' : null, [canSee]);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    if (data) setUpdatedAt(formatClock(new Date()));
  }, [data]);

  // 三道门都立在 AdminLayout 里：原来它们是一句裸文本，没有后台外壳、也没有页头标题，
  // 匿名访客看到的是白底上一行小字，读起来像页面坏了。
  if (authLoading) return <AdminLayout><Loading /></AdminLayout>;
  if (!user)
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="管理后台只对管理员与审核员开放，请先用管理账号登录。" href="/login?next=/admin" />
      </AdminLayout>
    );
  if (!canSee)
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限访问" desc="需要管理员或审核员角色，才能查看平台仪表盘。" />
      </AdminLayout>
    );

  // 手里已经有一屏数据时不再整页换成「加载中…」：刷新会把 6 张卡抹成一行字再弹回来
  const refreshing = loading && data != null;
  if (loading && !data) return <AdminLayout><Loading /></AdminLayout>;
  if (error && !data) return <AdminLayout><ErrorBox message={error} onRetry={reload} /></AdminLayout>;
  if (!data) return <AdminLayout><Empty label="暂无数据" hint="统计接口没有返回内容，可稍后重试" /></AdminLayout>;

  const t = data.totals;
  // 卡面上的快捷入口和侧栏读同一道门：仪表盘对全体管理成员开放，模块页却不是，
  // 于是只分到「评论」的审核员点用户数、点待审核，张张落到「无权限访问」。
  // 进不去就不给链接（数字照看，箭头和「点此处理」一起收掉）。
  const go = (href: string) => (canEnterAdmin(user, href) ? href : undefined);
  // 「最近审计日志」面板整块按 /admin/audit 的门收放：接口那边已经不往下发留痕了，
  // 这里再留一个空面板反而像渲染坏了。
  const seeAudit = canEnterAdmin(user, '/admin/audit');
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
      <PageHead
        eyebrow="治理概览"
        title="仪表盘"
        sub={
          <span className="num">
            {refreshing ? '正在刷新…' : updatedAt ? `数据更新于 ${updatedAt}` : '数据快照'}
          </span>
        }
        actions={
          <button className="btn-secondary btn-sm min-h-11 lg:min-h-0 inline-flex items-center gap-1.5" onClick={reload} disabled={loading}>
            <IconRefresh className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.7} />
            刷新
          </button>
        }
      />

      {/* 核心指标卡：整卡可点直达对应管理页。
          data-reveal-group 让六格逐格浮上来、data-count 让数字跑到位（.num 保证等宽数位，
          计数过程中卡片宽度不变，不会左右抽动）。 */}
      <div data-reveal-group className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6 lg:mb-8">
        <StatCard title="用户数" value={t.users} hint={`封禁 ${t.suspended}`} href={go('/admin/users')} />
        <StatCard title="已发布内容" value={t.published} hint={`总计 ${t.contents}`} href={go('/admin/contents')} />
        <StatCard
          title="待审核"
          value={t.pendingTasks}
          hint={go('/admin/reviews') ? (t.pendingTasks > 0 ? '点此处理' : '已清空') : undefined}
          href={go('/admin/reviews')}
          accent={t.pendingTasks > 0}
        />
        <StatCard title="活动数" value={t.activities} hint={`待审 ${t.pendingEvents}`} href={go('/admin/activities')} />
        <StatCard title="报名数" value={t.registrations} href={go('/admin/checkins')} />
        <StatCard title="团契数" value={t.groupCount} href={go('/admin/groups')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
        {/* 内容状态分布 */}
        <div className="card-tech hover:!transform-none rounded-2xl p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>内容状态分布</SectionTitle>
            <span className="num text-xs text-ink-500 shrink-0">共 {statusTotal} 篇</span>
          </div>
          {data.byStatus.length === 0 ? (
            <Empty label="暂无内容" href={go('/admin/contents')} hrefLabel="去内容管理" />
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
                    <div
                      className="flex-1 h-2.5 rounded-full bg-ink-100 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={s.c}
                      aria-valuemin={0}
                      aria-valuemax={maxStatus}
                      aria-label={`${contentStatusLabel(s.status)} ${s.c} 篇`}
                    >
                      <div
                        className={`h-full ${tone} transition-[width] duration-500 ease-out`}
                        style={{ width: `${(s.c / maxStatus) * 100}%` }}
                      />
                    </div>
                    <div className="num w-12 text-right text-sm font-semibold text-ink-700">{s.c}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 近 7 天用户增长：本页唯一一处「发光」的区块 —— 一圈常驻的发丝渐变描边 +
            指针跟随的柔光。后台只有一个强调位，六个格子全亮等于没亮。 */}
        <div data-spot className="spot glow-edge is-active card-tech hover:!transform-none rounded-2xl p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>近 7 天用户增长</SectionTitle>
            <span className="num text-xs text-ink-500 shrink-0">
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
                  <div className={`num text-xs ${g.c ? 'text-ink-600' : 'text-ink-500'}`} aria-hidden="true">{g.c}</div>
                  <div
                    className={`w-full rounded-t ${g.c ? 'bg-primary-500' : 'bg-ink-100'}`}
                    style={{ height: g.c ? `${(g.c / maxGrowth) * 100}%` : 3 }}
                    title={`${g.key}: ${g.c}`}
                    aria-hidden="true"
                  />
                  <div className="num text-[10px] text-ink-500" aria-hidden="true">{g.md}</div>
                </div>
              ))}
            </div>
            {growthTotal === 0 ? (
              <p className="absolute inset-x-0 top-[38%] px-2 text-center text-xs text-ink-500">
                近 7 天没有新注册，平台冷启动阶段属正常
                {go('/admin/users') && <Link href="/admin/users" className="text-primary-600 hover:underline ml-1 py-3 -my-3 whitespace-nowrap">看用户管理的存量构成</Link>}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div data-reveal-group className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* 最近审计日志：只留 6 条 + 入口，不再套一层内滚动。
            整块跟 /admin/audit 同一道门：留痕仅限管理员，接口对非管理员也不发了。 */}
        {seeAudit && (
        <div className="card-tech hover:!transform-none rounded-2xl p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>最近审计日志</SectionTitle>
            <PanelLink href={go('/admin/audit')}>查看全部</PanelLink>
          </div>
          {data.recentAudit.length === 0 ? (
            <Empty label="暂无审计日志" hint="管理员与审核员的每一次处置都会留痕在这里" />
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
                      <div className="num text-xs text-ink-400">{meta}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}

        {/* 热门内容 Top8：审计面板收掉时占满整行，不然右半空着一块 */}
        <div className={`card-tech hover:!transform-none rounded-2xl p-4 sm:p-5${seeAudit ? '' : ' lg:col-span-2'}`}>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionTitle>热门内容 Top8</SectionTitle>
            <PanelLink href={go('/admin/contents')}>内容管理</PanelLink>
          </div>
          {data.topContent.length === 0 ? (
            <Empty label="暂无内容" />
          ) : (
            <ol className="flex flex-col">
              {data.topContent.slice(0, 8).map((c, i) => (
                <li key={c.id}>
                  <Link
                    href={`/contents/${c.id}`}
                    className="flex items-center gap-3 text-sm rounded-xl px-2 -mx-2 py-2 -my-0.5 hover:bg-primary-50 transition-colors group"
                  >
                    <span className="num w-5 flex-shrink-0 text-center font-bold text-ink-500 group-hover:text-primary-600 transition-colors">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-ink-800 truncate group-hover:text-primary-700 transition-colors">{c.title}</div>
                      {/* ♥/👁/💬 三个 emoji 在表格里既花又不等价于文字（不同系统字体会掉字），
                          换成线性图标 + 等宽数字，读屏也不用再补 sr-only */}
                      <div className="num text-xs text-ink-400 inline-flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1">
                          <IconHeart className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                          {c.like_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconEye className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                          {c.view_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconChatDots className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
                          {c.comment_count}
                        </span>
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

/** 面板右上角的「查看全部 →」：箭头只在做位移，不改变文字宽度。给不出 href 就不出现。 */
function PanelLink({ href, children }: { href?: string; children: string }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      className="group/link inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-600 whitespace-nowrap py-1.5 -my-1.5 hover:text-primary-700 transition-colors"
    >
      {children}
      <IconArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5" strokeWidth={1.8} />
    </Link>
  );
}
