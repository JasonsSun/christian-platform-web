'use client';

import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { formatSize } from '@/lib/format';
import QuotaCard from '@/components/QuotaCard';
import { IconCheck } from '@/components/icons';
import { SkeletonGrid } from './shared';

/** 签到卡加载态：按真实卡片的行高占位，数据回填时不会有位移 */
function CheckinSkeleton() {
  return (
    <div className="glass card-tech rounded-2xl p-5" role="status" aria-label="加载中">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-24 rounded bg-ink-100 skeleton-sheen" />
          <div className="h-4 w-44 rounded bg-ink-100 skeleton-sheen" />
        </div>
        <div className="h-12 w-28 rounded-xl bg-ink-100 skeleton-sheen flex-shrink-0" />
      </div>
      <div className="mt-4 grid grid-cols-7 sm:grid-cols-10 gap-1.5">
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-ink-100 skeleton-sheen" />
        ))}
      </div>
    </div>
  );
}

function CheckinCard() {
  const { data, loading, reload } = useApi<any>('/me/growth', []);
  const { run, pending } = useAction();
  const { success, error: toastError } = useNotice();

  if (loading) return <CheckinSkeleton />;
  if (!data) return null;

  const c = data.checkin || {};
  const month = String(c.month || '').split('-');
  const daysInMonth = month.length === 2 ? new Date(Number(month[0]), Number(month[1]), 0).getDate() : 30;
  const grid = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${c.month}-${String(i + 1).padStart(2, '0')}`;
    return { d, on: (c.monthDays || []).includes(d) };
  });

  async function checkin() {
    const r = await run(() => apiPost<any>('/me/checkin'));
    if (!r) { toastError('签到失败，请稍后再试'); return; }
    success(r.message || '签到成功');
    if (r.bonus) setTimeout(() => success(r.bonus), 600);
    reload();
  }

  return (
    <div className="glass card-tech rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">每日签到</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            连续 <b className="num text-primary-700">{c.streak ?? 0}</b> 天 · 累计 <span className="num">{c.totalDays ?? 0}</span> 天 · 最长 <span className="num">{c.longestStreak ?? 0}</span> 天
          </p>
        </div>
        <button onClick={checkin} disabled={pending || c.checked} className="btn-primary disabled:opacity-60">
          {c.checked ? (
            <>
              今日已签到
              <IconCheck className="w-4 h-4" strokeWidth={2} />
            </>
          ) : pending ? '签到中…' : '立即签到'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 sm:grid-cols-10 gap-1.5">
        {grid.map((g) => (
          <div
            key={g.d}
            title={g.d}
            className={`h-7 rounded-md text-[11px] flex items-center justify-center border transition-colors ${
              g.on ? 'bg-primary-600 text-white border-primary-600' : 'bg-ui-surface text-ink-400 border-ink-100'
            }`}
          >
            <span className="num">{g.d.slice(-2)}</span>
          </div>
        ))}
      </div>

      {!!(data.tips || []).length && (
        <ul className="mt-4 text-xs text-ink-500 space-y-1 list-disc pl-5">
          {(data.tips || []).slice(0, 3).map((t: string) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

/** 邀请好友：邀请码 + 链接 + 成果 */
function InviteCard() {
  const { data } = useApi<any>('/me/invite', []);
  const { success, error: toastError } = useNotice();

  if (!data) return null;

  async function copy(text: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      success('已复制邀请链接');
    } catch {
      toastError('复制失败，请手动选择链接复制');
    }
  }

  return (
    <div className="glass card-tech rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">邀请好友</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            已邀请 <b className="num text-primary-700">{data.invitedCount ?? 0}</b> 人 · 好友注册后双方各得成长奖励
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="num px-3 py-1.5 rounded-lg bg-ink-100 font-mono text-sm tracking-widest text-ink-800">{data.code}</span>
          <button onClick={() => copy(data.url)} className="btn-primary">复制邀请链接</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-400 break-all">{data.url}</p>
    </div>
  );
}

export function MyGrowth() {
  const { data, loading, reload } = useApi<any>('/me/quota?refresh=1', []);
  const { run, pending } = useAction();

  if (loading) return <SkeletonGrid />;
  if (!data)
    return (
      <div className="text-center py-12 rounded-2xl border border-dashed border-ink-200 bg-white">
        <p className="text-ink-500">暂无画像数据</p>
      </div>
    );

  const p = data.profile || {};
  const hours = Math.floor((p.onlineSeconds || 0) / 3600);
  const minutes = Math.floor(((p.onlineSeconds || 0) % 3600) / 60);

  const metrics: { label: string; value: string }[] = [
    { label: '注册天数', value: `${p.accountAgeDays ?? 0} 天` },
    { label: '活跃天数', value: `${p.activeDays ?? 0} 天` },
    { label: '在线时长', value: hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟` },
    { label: '使用次数', value: `${p.actionCount ?? 0} 次` },
    { label: '访问次数', value: `${p.visitCount ?? 0} 次` },
    { label: '发布内容', value: `${p.approvedContentCount ?? 0}/${p.contentCount ?? 0} 篇` },
    { label: '上传媒体', value: `${p.mediaCount ?? 0} 个` },
    { label: '审核通过', value: `${p.approvedMediaCount ?? 0} 个` },
    { label: '审核驳回', value: `${p.rejectedMediaCount ?? 0} 个` },
    { label: '活动签到', value: `${p.checkinDays ?? 0} 次` },
    { label: '好友', value: `${p.friendCount ?? 0} 位` },
    { label: '评论', value: `${p.commentCount ?? 0} 条` },
    { label: '获赞', value: `${p.likeReceived ?? 0} 个` },
    { label: '违规', value: `${p.violationCount ?? 0} 次` },
    { label: '已用存储', value: formatSize(p.storageBytes || 0) },
    { label: '信任分', value: `${data.trustScore} / 100` },
  ];

  async function recompute() {
    await run(() => apiGet('/me/quota?refresh=1'));
    reload();
  }

  return (
    <div className="space-y-5">
      <CheckinCard />
      <InviteCard />
      <QuotaCard data={data} />

      <div className="glass card-tech rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink-900">我的画像指标</h3>
          <button onClick={recompute} disabled={pending} className="btn-chip disabled:opacity-60">
            {pending ? '计算中…' : '重新计算'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-ui-surface border border-ink-100 px-3 py-2.5 transition-colors hover:border-ink-300">
              <div className="num text-sm font-semibold text-ink-900">{m.value}</div>
              <div className="text-xs text-ink-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass card-tech rounded-2xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">如何提升上传额度</h3>
        <ul className="text-sm text-ink-600 space-y-2 list-disc pl-5">
          <li>保持在线：每累计 10 分钟 +1 分（上限 25 分）</li>
          <li>每天访问：每个活跃天 +2 分（上限 20 分）</li>
          <li>多互动：每 10 次点击/操作 +1 分（上限 15 分）</li>
          <li>发布内容：每篇已发布 +3 分（上限 15 分）</li>
          <li>上传通过审核的媒体：每个 +1 分（上限 10 分）</li>
          <li>活动签到、结交朋友、获得点赞也会累积少量分值</li>
          <li className="text-rose-700">内容被驳回 -2 分 / 次，被判定违规 -8 分 / 次</li>
        </ul>
        {data.next ? (
          <div className="mt-4 rounded-xl bg-gold-50 border border-gold-100 px-4 py-3 text-sm text-gold-800">
            再获得 <b className="num">{data.next.gap}</b> 分即可升级为「{data.next.name}」：{data.next.gains}
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-gold-50 border border-gold-100 px-4 py-3 text-sm text-gold-800">
            你已是最高等级，享有全部上传权益。
          </div>
        )}
      </div>
    </div>
  );
}
