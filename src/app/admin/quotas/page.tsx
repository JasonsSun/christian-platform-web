'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { apiPatch, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatSize } from '@/lib/format';
import { AdminLayout, StatCard, SectionTitle, Loading, Empty, ErrorBox, RoleBadge } from '../_components';

interface Policy {
  level: number; name: string; minScore: number;
  maxVideoMb: number; maxAudioMb: number; maxImageMb: number; maxDocMb: number;
  maxVideoSeconds: number; maxAudioSeconds: number;
  dailyUploads: number; dailyBytes: number; totalBytes: number;
}

interface GrowthUser {
  id: string; username: string; displayName: string; role: string;
  level: number; levelName: string; trustScore: number;
  onlineSeconds: number; actionCount: number; activeDays: number;
  mediaCount: number; approvedMediaCount: number; rejectedMediaCount: number;
  contentCount: number; approvedContentCount: number;
  storageBytes: number; violationCount: number; accountAgeDays: number;
}

const LEVEL_TONE = ['bg-ink-100 text-ink-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-primary-100 text-primary-700', 'bg-gold-100 text-gold-800', 'bg-purple-100 text-purple-700'];

function fmtDur(sec: number) {
  if (!sec) return '不限';
  if (sec >= 3600) return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)} 小时`;
  return `${Math.round(sec / 60)} 分钟`;
}

/** 一个带标题和单位提示的数字输入框 */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-ink-500">{label}</span>
        {hint ? <span className="text-[11px] text-ink-300">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export default function AdminQuotasPage() {
  const { user, loading: authLoading } = useAuth();
  const [kw, setKw] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const { run, pending } = useAction();
  const [msg, setMsg] = useState('');

  const { data, loading, error, reload } = useApi<{
    policies: Policy[]; stats: any; users: GrowthUser[]; total: number;
  }>(`/admin/quotas${qs({ kw, level, page, pageSize })}`, [kw, level, page]);

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (user === null) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">
        请先登录以访问管理后台。 <Link className="btn-primary ml-2" href="/login">去登录</Link>
      </div>
    );
  }
  if (user.role !== 'moderator' && user.role !== 'admin') {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-ink-500">无权限访问（需要审核员或管理员角色）。</div>;
  }
  const isAdmin = user.role === 'admin';

  function setDraft(levelNum: number, key: string, value: string) {
    setDrafts((d) => ({ ...d, [levelNum]: { ...(d[levelNum] || {}), [key]: value } }));
  }

  async function savePolicy(p: Policy) {
    const d = drafts[p.level] || {};
    if (!Object.keys(d).length) return;
    setMsg('');
    const res = await run(() => apiPatch('/admin/quotas/policy', { level: p.level, ...d }));
    if (res) {
      setMsg(`等级「${p.name}」策略已更新`);
      setDrafts((prev) => ({ ...prev, [p.level]: {} }));
      reload();
    }
  }

  async function recompute(userId?: string) {
    setMsg('');
    const res = await run(() => apiPost('/admin/quotas', userId ? { userId } : { all: true }));
    if (res) {
      setMsg(userId ? '已重算该用户画像' : `已重算 ${(res as any).recomputed} 个用户画像`);
      reload();
    }
  }

  return (
    <AdminLayout>
      <SectionTitle>成长与配额</SectionTitle>
      <p className="text-sm text-ink-500 -mt-2 mb-6">
        按「在线时长 / 使用次数 / 内容贡献 / 违规」计算信任分并自动分级，等级越高可上传的视频越长、文件越大、每日次数越多。
      </p>

      {loading ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {msg ? <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2 text-sm text-emerald-700">{msg}</div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="画像用户" value={data.stats.users} hint="已生成成长画像" />
            <StatCard title="平均信任分" value={data.stats.avgScore} hint="满分 100" />
            <StatCard title="占用存储" value={formatSize(data.stats.storageBytes)} hint="全站媒体" />
            <StatCard title="累计在线" value={`${Math.round(data.stats.onlineSeconds / 3600)} 小时`} hint="全站合计" />
          </div>

          {/* 等级分布 */}
          <div className="glass rounded-2xl p-5 mb-6">
            <h3 className="font-semibold text-ink-900 mb-3">等级分布</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.stats.byLevel.map((b: any) => (
                <div key={b.level} className="rounded-2xl border border-ink-100 bg-white/70 px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_TONE[b.level] || LEVEL_TONE[0]}`}>
                    L{b.level} {b.name}
                  </span>
                  <div className="text-lg font-semibold text-ink-800 mt-2">
                    {b.count} <span className="text-xs font-normal text-ink-400">人</span>
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">{formatSize(b.storageBytes)}</div>
                </div>
              ))}
              {!data.stats.byLevel.length ? <Empty label="暂无画像数据" /> : null}
            </div>
          </div>

          {/* 配额策略：每个等级一张卡，字段带标签，不再横向滚动 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink-900">配额策略（各成长等级上限）</h3>
              {!isAdmin ? <span className="text-xs text-ink-400">仅管理员可修改</span> : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.policies.map((p) => {
                const d = drafts[p.level] || {};
                const dirty = Object.keys(d).length > 0;
                return (
                  <div
                    key={p.level}
                    className={`rounded-2xl border p-4 transition-colors ${
                      dirty ? 'border-primary-300 bg-primary-50/50' : 'border-ink-100 bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_TONE[p.level] || LEVEL_TONE[0]}`}>
                          L{p.level} {p.name}
                        </span>
                        <span className="text-xs text-ink-400 whitespace-nowrap">信任分 ≥{p.minScore}</span>
                      </div>
                      <button
                        onClick={() => savePolicy(p)}
                        disabled={!isAdmin || pending || !dirty}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white transition-opacity disabled:opacity-30"
                      >
                        保存
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                      <Field label="视频大小 (MB)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxVideoMb ?? p.maxVideoMb}
                          onChange={(e) => setDraft(p.level, 'maxVideoMb', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="视频时长" hint={fmtDur(Number(d.maxVideoSeconds ?? p.maxVideoSeconds))}>
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxVideoSeconds ?? p.maxVideoSeconds}
                          onChange={(e) => setDraft(p.level, 'maxVideoSeconds', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="音乐大小 (MB)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxAudioMb ?? p.maxAudioMb}
                          onChange={(e) => setDraft(p.level, 'maxAudioMb', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="音乐时长" hint={fmtDur(Number(d.maxAudioSeconds ?? p.maxAudioSeconds))}>
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxAudioSeconds ?? p.maxAudioSeconds}
                          onChange={(e) => setDraft(p.level, 'maxAudioSeconds', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="图片大小 (MB)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxImageMb ?? p.maxImageMb}
                          onChange={(e) => setDraft(p.level, 'maxImageMb', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="资料大小 (MB)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.maxDocMb ?? p.maxDocMb}
                          onChange={(e) => setDraft(p.level, 'maxDocMb', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="每日上传 (次)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.dailyUploads ?? p.dailyUploads}
                          onChange={(e) => setDraft(p.level, 'dailyUploads', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                      <Field label="总存储 (MB)">
                        <input className="input-styled w-full px-2.5 py-1.5 text-sm" value={d.totalMb ?? Math.round(p.totalBytes / 1048576)}
                          onChange={(e) => setDraft(p.level, 'totalMb', e.target.value)} disabled={!isAdmin} inputMode="numeric" />
                      </Field>
                    </div>

                    {dirty ? <p className="text-[11px] text-primary-600 mt-3">有未保存的改动</p> : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 用户画像 */}
          <div className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h3 className="font-semibold text-ink-900">
                用户画像 <span className="text-sm font-normal text-ink-400">共 {data.total} 人</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    className="input-styled w-56 pl-9 pr-3 py-1.5 text-sm"
                    placeholder="搜索用户名 / 昵称 / 邮箱"
                    value={kwInput}
                    onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setKw(kwInput); setPage(1); } }}
                  />
                </div>
                <select className="input-styled w-auto px-3 py-1.5 text-sm" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
                  <option value="">全部等级</option>
                  {data.policies.map((p) => <option key={p.level} value={p.level}>L{p.level} {p.name}</option>)}
                </select>
                <button onClick={() => { setKw(kwInput); setPage(1); }} className="btn-primary text-sm px-4 py-1.5">搜索</button>
                <button onClick={() => recompute()} disabled={pending} className="btn-secondary text-sm px-4 py-1.5 disabled:opacity-50">
                  全部重算
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="text-left text-ink-500 text-xs border-b border-ink-100">
                    <th className="py-2.5 pr-3">用户</th>
                    <th className="py-2.5 pr-3">等级</th>
                    <th className="py-2.5 pr-3">信任分</th>
                    <th className="py-2.5 pr-3">在线时长</th>
                    <th className="py-2.5 pr-3">使用次数</th>
                    <th className="py-2.5 pr-3">活跃天</th>
                    <th className="py-2.5 pr-3">内容(通过)</th>
                    <th className="py-2.5 pr-3">媒体(通过/驳回)</th>
                    <th className="py-2.5 pr-3">存储</th>
                    <th className="py-2.5 pr-3">违规</th>
                    <th className="py-2.5 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-ink-50 hover:bg-ink-50/50">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-ink-900">{u.displayName}</div>
                        <div className="text-xs text-ink-400">@{u.username} · <RoleBadge role={u.role} /></div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_TONE[u.level] || LEVEL_TONE[0]}`}>
                          L{u.level} {u.levelName}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-ink-900">{u.trustScore}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{Math.round(u.onlineSeconds / 60)} 分</td>
                      <td className="py-2.5 pr-3 text-ink-600">{u.actionCount}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{u.activeDays}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{u.contentCount}（{u.approvedContentCount}）</td>
                      <td className="py-2.5 pr-3 text-ink-600">
                        {u.mediaCount}（{u.approvedMediaCount}/{u.rejectedMediaCount}）
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">{formatSize(u.storageBytes)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={u.violationCount ? 'text-rose-600 font-semibold' : 'text-ink-400'}>
                          {u.violationCount}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <button onClick={() => recompute(u.id)} disabled={pending}
                          className="text-xs px-3 py-1.5 rounded-lg border border-ink-200 hover:bg-ink-50 disabled:opacity-50">
                          重算
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!data.users.length ? <Empty label="没有匹配的用户画像" /> : null}

            <div className="flex items-center gap-3 mt-4 text-sm">
              <button className="btn-secondary disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <span className="text-ink-500">第 {page} 页 / 共 {Math.max(1, Math.ceil(data.total / pageSize))} 页</span>
              <button className="btn-secondary disabled:opacity-40" disabled={page * pageSize >= data.total} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          </div>
        </>
      ) : null}
    </AdminLayout>
  );
}
