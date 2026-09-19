'use client';

import { useState, Fragment } from 'react';
import { apiGet } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { AdminLayout, Loading, ErrorBox, Empty } from '@/app/admin/_components';
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
        <div className="py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🔒</div>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        </div>
      </AdminLayout>
    );
  }
  if (!isStaff) {
    return (
      <AdminLayout>
        <div className="py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🚫</div>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">无权限</h2>
          <p className="text-ink-500">仅审核员或管理员可访问签到报表</p>
        </div>
      </AdminLayout>
    );
  }

  const items = data?.items || [];

  return (
    <AdminLayout>
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">活动签到报表</h1>
      <p className="text-ink-500 text-sm mb-6">查看各活动的报名与现场签到情况,点击活动展开签到名单</p>

      {loading && <Loading label="加载中…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && items.length === 0 && <Empty label="暂无活动数据" />}

      {!loading && !error && items.length > 0 && (
        <div className="bg-white rounded-2xl border border-ink-100 shadow-soft overflow-hidden">
          {/* 窄屏下横向滚动，而不是把 760px 的列宽压成竖排（探针实测） */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">活动签到报表</caption>
            <thead>
              <tr className="whitespace-nowrap bg-ink-50 text-ink-600 text-left">
                <th scope="col" className="px-4 py-3 font-medium">活动</th>
                <th scope="col" className="px-4 py-3 font-medium">城市</th>
                <th scope="col" className="px-4 py-3 font-medium">时间</th>
                <th scope="col" className="px-4 py-3 font-medium text-center">报名</th>
                <th scope="col" className="px-4 py-3 font-medium text-center">签到</th>
                <th scope="col" className="px-4 py-3 font-medium text-center">签到率</th>
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
                          className="flex items-center gap-2 text-left font-medium text-ink-900"
                        >
                          <span aria-hidden="true" className={`text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                          {a.title}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{a.city || '—'}</td>
                      <td className="px-4 py-3 text-ink-600">{timeAgo(a.startAt)}</td>
                      <td className="px-4 py-3 text-center text-ink-700">{a.confirmed}{a.waitlist > 0 ? ` (+${a.waitlist}候补)` : ''}</td>
                      <td className="px-4 py-3 text-center font-semibold text-primary-700">{a.checkins}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${rate >= 80 ? 'bg-emerald-50 text-emerald-700' : rate >= 40 ? 'bg-gold-100 text-gold-800' : 'bg-ink-100 text-ink-600'}`}>
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
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
