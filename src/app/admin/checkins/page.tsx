'use client';

import { useState, Fragment } from 'react';
import { apiGet } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { AdminLayout, Loading, TableSkeleton, TableShell, Th, Empty, ErrorBox, PageHead, AccessState } from '@/app/admin/_components';
import { IconChevronRight } from '@/components/icons';
import { timeAgo } from '@/lib/format';

interface ActivityRow {
  id: string;
  title: string;
  city: string;
  capacity: number;
  startAt: string;
  confirmed: number;
  waitlist: number;
  checkins: number;
}

interface Attendee {
  id: string;
  displayName: string;
  username: string;
  avatarColor: string;
  city: string;
  church: string;
  checkedAt: string;
}

export default function AdminCheckinsPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: ActivityRow[] }>(
    user && (user.role === 'moderator' || user.role === 'admin') ? '/admin/checkins' : null,
    [user]
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; attendees: Attendee[]; total: number; registrations: number } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isStaff = user && (user.role === 'moderator' || user.role === 'admin');

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setLoadingDetail(true);
    try {
      const res = await apiGet<{ attendees: Attendee[]; total: number; registrations: number }>(`/admin/checkins?activityId=${id}`);
      setDetail({ id, attendees: res.attendees, total: res.total, registrations: res.registrations });
    } catch (e) {
      // 忽略,保留展开状态
    } finally {
      setLoadingDetail(false);
    }
  }

  if (authLoading) {
    return <AdminLayout><Loading label="加载中…" /></AdminLayout>;
  }
  if (!user) {
    return (
      <AdminLayout>
        <AccessState title="请先登录" desc="签到报表只对审核员与管理员开放，请先用管理账号登录。" href="/login?next=/admin/checkins" />
      </AdminLayout>
    );
  }
  if (!isStaff) {
    return (
      <AdminLayout>
        <AccessState kind="ban" title="无权限" desc="仅审核员或管理员可访问签到报表" />
      </AdminLayout>
    );
  }

  const items = data?.items || [];

  return (
    <AdminLayout>
      <PageHead
        eyebrow="协作 · 活动"
        title="活动签到报表"
        sub="查看各活动的报名与现场签到情况，点击活动展开签到名单"
      />

      {loading && !data && <TableSkeleton cols={6} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && items.length === 0 && <Empty label="暂无活动数据" />}

      {!loading && !error && items.length > 0 && (
        <TableShell>
          {/* 窄屏下横向滚动，而不是把 760px 的列宽压成竖排（探针实测） */}
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">活动签到报表</caption>
            <thead className="bg-ink-50 text-ink-600">
              <tr className="whitespace-nowrap text-left">
                <Th>活动</Th>
                <Th>城市</Th>
                <Th>时间</Th>
                <Th className="text-center">报名</Th>
                <Th className="text-center">签到</Th>
                <Th className="text-center">签到率</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const rate = a.confirmed > 0 ? Math.round((a.checkins / a.confirmed) * 100) : 0;
                const open = openId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className="border-t border-ink-100 hover:bg-primary-50/40">
                      <td className="px-4 py-3">
                        {/* 展开名单靠行上的 onClick 键盘根本触发不了，改成单元格里一个真按钮 */}
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          aria-expanded={open}
                          className="min-h-11 lg:min-h-0 flex items-center gap-1.5 text-left font-medium text-ink-900"
                        >
                          <IconChevronRight
                            className={`w-4 h-4 shrink-0 text-ink-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                            strokeWidth={2}
                          />
                          <span className="min-w-0">{a.title}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{a.city || '—'}</td>
                      <td className="px-4 py-3 text-ink-600">{timeAgo(a.startAt)}</td>
                      <td className="num px-4 py-3 text-center text-ink-700">{a.confirmed}{a.waitlist > 0 ? ` (+${a.waitlist}候补)` : ''}</td>
                      <td className="num px-4 py-3 text-center font-semibold text-primary-700">{a.checkins}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`num inline-block px-2 py-0.5 rounded-full text-xs font-medium ${rate >= 80 ? 'bg-emerald-50 text-emerald-700' : rate >= 40 ? 'bg-gold-100 text-gold-800' : 'bg-ink-100 text-ink-600'}`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${a.id}-d`} className="bg-ink-50/60">
                        <td colSpan={6} className="px-4 py-4">
                          {loadingDetail && openId === a.id ? (
                            <div className="text-ink-400 text-sm py-4 text-center">加载签到名单…</div>
                          ) : detail && detail.id === a.id ? (
                            detail.attendees.length === 0 ? (
                              <div className="text-ink-400 text-sm py-4 text-center">该活动尚无签到记录</div>
                            ) : (
                              <div className="grid sm:grid-cols-2 gap-2">
                                {detail.attendees.map((p) => (
                                  <div key={p.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-ink-100">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ background: p.avatarColor }}>
                                      {p.displayName.slice(0, 1)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm text-ink-900 font-medium truncate">{p.displayName}</div>
                                      <div className="text-xs text-ink-400 truncate">{p.city || '—'}{p.church ? ` · ${p.church}` : ''}</div>
                                    </div>
                                    <span className="text-xs text-ink-400">{timeAgo(p.checkedAt)}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </AdminLayout>
  );
}
