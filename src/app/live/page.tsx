'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { apiPost, qs } from '@/lib/api';
import { formatDateTime, formatTimestamp } from '@/lib/format';
import { Loading, Empty, ErrorBox } from '@/components/ui';
import { MediaUploader } from '@/components/MediaUploader';
import {
  IconPlus,
  IconBroadcast,
  IconCheck,
  IconFilm,
  IconEye,
  IconHourglass,
  IconClose,
  IconBell,
} from '@/components/icons';
import type { LiveRoom } from '@/lib/types';

export default function LiveListPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  const notice = useNotice();
  const [tab, setTab] = useState<'live' | 'all' | 'recordings' | 'reminded'>('live');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recordEnabled, setRecordEnabled] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewVideoId, setReviewVideoId] = useState<string | null>(null);
  const livePath = tab === 'reminded' ? '/live?remindedBy=1' : tab === 'live' ? '/live?status=live' : '/live';
  const { data, loading, error, reload } = useApi<{ rooms: LiveRoom[] }>(livePath, [tab]);
  const { data: recData, loading: recLoading } = useApi<{ items: any[] }>(
    tab === 'recordings' ? '/live/recordings' : null, [tab]
  );
  const { run, pending } = useAction();

  async function createRoom() {
    if (!title.trim() || !user) return;
    const r = await run(() => apiPost<{ reviewStatus?: string }>('/live', {
      title: title.trim(),
      description: desc.trim(),
      recordEnabled,
      scheduledAt: scheduledAt || undefined,
    }));
    if (r) {
      setTitle(''); setDesc(''); setScheduledAt(''); setShowCreate(false);
      notice.success(
        r.reviewStatus === 'pending'
          ? '直播间已创建，等待管理员审核后即可开播'
          : '直播间已创建，可直接开播'
      );
      reload();
    }
  }

  async function cancelRoom(room: LiveRoom) {
    const r = await run(() => apiPost(`/live/${room.id}/cancel`, { reason: '主播取消本场直播' }));
    if (r) {
      notice.success('已取消该直播间');
      reload();
    }
  }

  const rooms = data?.rooms || [];

  /** 状态徽标优先级:取消 > 过期 > 待审 > 直播中 > 预告
   *  底色与文字必须成对：bg-ink-300/400/500 配 text-white 在白底上是浅紫配白字，
   *  深色主题又完全不在白名单里，两头都读不出来。失效态统一走中性 chip 写法。 */
  function badgeOf(r: LiveRoom) {
    if (r.cancelled) return { text: '已取消', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    if (r.expired) return { text: '已过期', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    if (r.reviewStatus === 'pending') return { text: '待审核', cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
    if (r.live) return { text: '● 直播中', cls: 'bg-rose-600 text-white' };
    if (r.status === 'ended') return { text: '已结束', cls: 'bg-ink-100 text-ink-600 border border-ink-200' };
    return { text: '预告', cls: 'bg-ink-700/80 text-white/90' };
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">直播</h1>
          <p className="text-sm text-ink-500 mt-1">主日崇拜、祷告会、特会,与弟兄姐妹实时相聚。</p>
        </div>
        {user && (
          <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? '收起' : <><IconPlus className="w-4 h-4" strokeWidth={2.2} /> 创建直播</>}
          </button>
        )}
      </div>

      {user && showCreate && (
        <div className="glass rounded-2xl p-5 sm:p-6 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <IconBroadcast className="w-5 h-5 text-primary-600" strokeWidth={1.7} />
            <h2 className="font-display font-bold text-ink-900">创建直播间</h2>
          </div>

          {/* 普通用户申请开播:需提交现场视频作为审核材料(证明当前可现场直播)。
              审核通过后系统会发通知,点通知直达开播页,开播页内已有开播指南引导。 */}
          {!isStaff && (
            <div className="mb-5">
              {/* 下面是 MediaUploader（一组控件），指不到单个 input，所以是说明文字而非 label */}
              <p className="block text-sm font-semibold text-ink-700 mb-2">
                现场视频审核材料 <span className="text-rose-600" aria-hidden="true">*</span>
                <span className="sr-only">（必填）</span>
              </p>
              <p className="text-xs text-ink-400 mb-3 leading-relaxed">
                普通用户开播前需先通过审核。请上传一段<b>现场短视频</b>（手机拍几秒当前现场即可），
                证明你现在可以进行现场直播。审核通过后系统会发通知，点通知即可进入开播页。
              </p>
              {reviewVideoId ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                  <span className="text-sm text-emerald-700 flex items-center gap-2">
                    <IconCheck className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                    已上传审核视频，可随直播间一并提交
                  </span>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setReviewVideoId(null)}
                  >
                    重新上传
                  </button>
                </div>
              ) : (
                <MediaUploader
                  accept="video/*"
                  multiple={false}
                  maxFiles={1}
                  onSuccess={(res) => {
                    if (res.kind === 'video') setReviewVideoId(res.id);
                    else setReviewVideoId(null);
                  }}
                />
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="live-title" className="block text-sm font-semibold text-ink-700 mb-2">
                直播标题 <span className="text-rose-600" aria-hidden="true">*</span>
                <span className="sr-only">（必填）</span>
              </label>
              <input
                id="live-title"
                name="title"
                // 不是原生 form 提交（点按钮走 createRoom 自行校验），required 不生效，用 aria-required 表达必填
                aria-required="true"
                className="input-styled"
                placeholder="例如：主日崇拜直播"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createRoom(); }}
              />
            </div>

            <div>
              <label htmlFor="live-desc" className="block text-sm font-semibold text-ink-700 mb-2">
                简介 <span className="text-ink-400 font-normal">（可选）</span>
              </label>
              <textarea
                id="live-desc"
                name="description"
                className="input-styled min-h-[88px] resize-y"
                placeholder="简单介绍本场直播的主题、讲员或流程…"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="live-scheduled" className="block text-sm font-semibold text-ink-700 mb-2">
                约定开播时间 <span className="text-ink-400 font-normal">（可选，过了约定时间 24 小时后直播间自动失效）</span>
              </label>
              <input
                id="live-scheduled"
                name="scheduledAt"
                type="datetime-local"
                className="input-styled"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl px-3.5 py-3 bg-ink-50/70 border border-ink-100 text-sm cursor-pointer select-none transition-colors hover:bg-ink-100/70">
              <input
                type="checkbox"
                name="recordEnabled"
                checked={recordEnabled}
                onChange={(e) => setRecordEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="leading-snug">
                <span className="font-medium text-ink-800">保存录像</span>
                <span className="block text-xs text-ink-400 mt-0.5">
                  直播结束后自动落盘，经审核通过后发布到媒体视频区
                </span>
              </span>
            </label>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="btn-primary"
                disabled={pending || !title.trim() || (!isStaff && !reviewVideoId)}
                onClick={createRoom}
              >
                {pending ? '创建中…' : '创建直播间'}
              </button>
              <span className="text-xs text-ink-400">
                {user?.role === 'admin'
                  ? '管理员创建免审核，创建后即可在详情页拿到 OBS 推流地址与密钥'
                  : user?.role === 'moderator'
                    ? '审核员创建后需超管审核通过方可开播'
                    : '创建后需管理员审核通过才能开播；创建后也可随时取消'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-5 flex-wrap" role="group" aria-label="直播列表筛选">
        <button aria-pressed={tab === 'live'} className={`px-3 py-1.5 rounded-full text-sm ${tab === 'live' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`} onClick={() => setTab('live')}>正在直播</button>
        <button aria-pressed={tab === 'all'} className={`px-3 py-1.5 rounded-full text-sm ${tab === 'all' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`} onClick={() => setTab('all')}>全部预告</button>
        <button aria-pressed={tab === 'recordings'} className={`px-3 py-1.5 rounded-full text-sm ${tab === 'recordings' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`} onClick={() => setTab('recordings')}>直播回放</button>
        {user && (
          <button aria-pressed={tab === 'reminded'} className={`px-3 py-1.5 rounded-full text-sm ${tab === 'reminded' ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-600'}`} onClick={() => setTab('reminded')}>我的预约</button>
        )}
      </div>

      {loading ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!loading && !rooms.length ? <Empty label="暂无可观看的直播" /> : null}

      {tab === 'recordings' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          {recLoading ? <Loading /> : null}
          {(recData?.items || []).map((r: any) => (
            <Link key={r.roomId} href={`/media/${r.mediaId}`} className="glass rounded-2xl overflow-hidden card-hover">
              <div className="relative aspect-video bg-ink-900 flex items-center justify-center">
                {r.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={r.posterUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <IconFilm className="w-10 h-10 text-white/40" strokeWidth={1.4} />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-ink-900 line-clamp-1">{r.title}</h3>
                <p className="text-xs text-ink-400 mt-1">
                  {r.viewerPeak} 次观看
                  {r.durationSec ? ` · ${formatTimestamp(r.durationSec)}` : ''}
                </p>
              </div>
            </Link>
          ))}
          {!recLoading && !(recData?.items || []).length ? <Empty label="暂无直播回放" /> : null}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
        {rooms.map((r) => {
          const b = badgeOf(r);
          const isOwner = !!user && user.id === r.owner?.id;
          const cancellable = isOwner && r.status !== 'ended' && !r.cancelled && !r.expired;
          return (
            <div key={r.id} className="glass rounded-2xl overflow-hidden card-hover">
              <Link href={`/live/${r.id}`} className="block">
                <div className="relative aspect-video bg-ink-900 flex items-center justify-center">
                  {r.coverUrl ? (
                    <img loading="lazy" decoding="async" src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <IconBroadcast className="w-10 h-10 text-white/40" strokeWidth={1.4} />
                  )}
                  <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-semibold ${b.cls}`}>
                    {b.text}
                  </span>
                  {r.live && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs bg-black/60 text-white/90 flex items-center gap-1">
                      <IconEye className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      {r.viewerCount}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-ink-900 line-clamp-1">{r.title}</h3>
                  <p className="text-xs text-ink-400 mt-1">
                    {r.owner?.displayName || '主播'}
                    {r.startedAt ? ` · ${formatDateTime(r.startedAt)}` : ''}
                    {r.scheduledAt ? ` · 约定 ${formatDateTime(r.scheduledAt)}` : ''}
                  </p>
                  {r.cancelled && r.cancelReason ? (
                    <p className="text-xs text-ink-400 mt-1">取消原因:{r.cancelReason}</p>
                  ) : null}
                  {isOwner && r.reviewStatus === 'pending' && !r.cancelled ? (
                    <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                      <IconHourglass className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      等待管理员审核，通过后即可开播
                    </p>
                  ) : null}
                  {isOwner && r.reviewStatus === 'rejected' && !r.cancelled ? (
                    <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                      <IconClose className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                      <span>审核未通过{r.reviewNote ? `:${r.reviewNote}` : ''}</span>
                    </p>
                  ) : null}
                  {typeof r.reminderCount === 'number' && r.reminderCount > 0 ? (
                    <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                      <IconBell className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      <span>{r.reminderCount} 人已预约</span>
                    </p>
                  ) : null}
                </div>
              </Link>
              {cancellable && (
                <div className="px-4 pb-4 flex items-center justify-between">
                  <span className="text-xs text-ink-400">{isStaff ? '管理员可随时管理' : '开播前可取消'}</span>
                  <button className="btn-ghost text-xs text-rose-600" disabled={pending} onClick={() => cancelRoom(r)}>
                    取消直播
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
