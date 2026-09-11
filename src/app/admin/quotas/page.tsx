'use client';

import { useState } from 'react';
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
  if (sec >= 3600) return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)} 小时`;
  return `${Math.round(sec / 60)} 分钟`;
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
      <p className="text-sm text-ink-500 -mt-2 mb-5">
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

          <div className="glass rounded-2xl p-5 mb-6">
            <h3 className="font-semibold text-ink-900 mb-3">等级分布</h3>
            <div className="flex flex-wrap gap-3">
              {data.stats.byLevel.map((b: any) => (
                <div key={b.level} className="rounded-xl border border-ink-100 bg-white/70 px-4 py-2.5 min-w-[120px]">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_TONE[b.level] || LEVEL_TONE[0]}`}>
                    L{b.level} {b.name}
                  </span>
                  <div className="text-sm text-ink-700 mt-1.5">{b.count} 人</div>
                  <div className="text-xs text-ink-400">{formatSize(b.storageBytes)}</div>
                </div>
              ))}
              {!data.stats.byLevel.length ? <Empty label="暂无画像数据" /> : null}
            </div>
          </div>

          <div className="glass rounded-2xl p-5 mb-6 overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink-900">配额策略（各成长等级上限）</h3>
              {!isAdmin ? <span className="text-xs text-ink-400">仅管理员可修改</span> : null}
            </div>
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-ink-500 text-xs border-b border-ink-100">
                  <th className="py-2 pr-2">等级</th>
                  <th className="py-2 pr-2">分数</th>
                  <th className="py-2 pr-2">视频(MB/时长)</th>
                  <th className="py-2 pr-2">音乐(MB/时长)</th>
                  <th className="py-2 pr-2">图片MB</th>
                  <th className="py-2 pr-2">资料MB</th>
                  <th className="py-2 pr-2">每日次数</th>
                  <th className="py-2 pr-2">总存储MB</th>
                  <th className="py-2 pr-2" />
                </tr>
              </thead>
              <tbody>
                {data.policies.map((p) => {
                  const d = drafts[p.level] || {};
                  return (
                    <tr key={p.level} className="border-b border-ink-50 align-top">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_TONE[p.level] || LEVEL_TONE[0]}`}>
                          L{p.level} {p.name}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-ink-600">≥{p.minScore}</td>
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          <input className="input-styled w-16 px-2 py-1 text-xs" value={d.maxVideoMb ?? p.maxVideoMb}
                            onChange={(e) => setDraft(p.level, 'maxVideoMb', e.target.value)} disabled={!isAdmin} />
                          <input className="input-styled w-20 px-2 py-1 text-xs" value={d.maxVideoSeconds ?? p.maxVideoSeconds}
                            onChange={(e) => setDraft(p.level, 'maxVideoSeconds', e.target.value)} disabled={!isAdmin} />
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5">
                          当前 {fmtDur(Number(d.maxVideoSeconds ?? p.maxVideoSeconds))}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          <input className="input-styled w-16 px-2 py-1 text-xs" value={d.maxAudioMb ?? p.maxAudioMb}
                            onChange={(e) => setDraft(p.level, 'maxAudioMb', e.target.value)} disabled={!isAdmin} />
                          <input className="input-styled w-20 px-2 py-1 text-xs" value={d.maxAudioSeconds ?? p.maxAudioSeconds}
                            onChange={(e) => setDraft(p.level, 'maxAudioSeconds', e.target.value)} disabled={!isAdmin} />
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <input className="input-styled w-16 px-2 py-1 text-xs" value={d.maxImageMb ?? p.maxImageMb}
                          onChange={(e) => setDraft(p.level, 'maxImageMb', e.target.value)} disabled={!isAdmin} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="input-styled w-16 px-2 py-1 text-xs" value={d.maxDocMb ?? p.maxDocMb}
                          onChange={(e) => setDraft(p.level, 'maxDocMb', e.target.value)} disabled={!isAdmin} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="input-styled w-16 px-2 py-1 text-xs" value={d.dailyUploads ?? p.dailyUploads}
                          onChange={(e) => setDraft(p.level, 'dailyUploads', e.target.value)} disabled={!isAdmin} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="input-styled w-20 px-2 py-1 text-xs" value={d.totalMb ?? Math.round(p.totalBytes / 1048576)}
                          onChange={(e) => setDraft(p.level, 'totalMb', e.target.value)} disabled={!isAdmin} />
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <button onClick={() => savePolicy(p)} disabled={!isAdmin || pending || !Object.keys(d).length}
                          className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white disabled:opacity-40">
                          保存
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-ink-900">用户画像（共 {data.total} 人）</h3>
              <div className="flex gap-2">
                <input
                  className="input-styled w-48 px-3 py-1.5 text-sm"
                  placeholder="搜索用户名/昵称/邮箱"
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setKw(kwInput); setPage(1); } }}
                />
                <select className="input-styled px-3 py-1.5 text-sm" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
                  <option value="">全部等级</option>
                  {data.policies.map((p) => <option key={p.level} value={p.level}>L{p.level} {p.name}</option>)}
                </select>
                <button onClick={() => { setKw(kwInput); setPage(1); }} className="btn-secondary text-sm">搜索</button>
                <button onClick={() => recompute()} disabled={pending} className="btn-secondary text-sm disabled:opacity-50">
                  全部重算
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="text-left text-ink-500 text-xs border-b border-ink-100">
                    <th className="py-2 pr-3">用户</th>
                    <th className="py-2 pr-3">等级</th>
                    <th className="py-2 pr-3">信任分</th>
                    <th className="py-2 pr-3">在线时长</th>
                    <th className="py-2 pr-3">使用次数</th>
                    <th className="py-2 pr-3">活跃天</th>
                    <th className="py-2 pr-3">内容(通过)</th>
                    <th className="py-2 pr-3">媒体(通过/驳回)</th>
                    <th className="py-2 pr-3">存储</th>
                    <th className="py-2 pr-3">违规</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-ink-50">
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
