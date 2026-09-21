'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useId } from 'react';
import { apiPost, apiDelete, apiPatch } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import { timeAgo } from '@/lib/format';
import { groupCategoryLabel } from '@/lib/labels';
import type { Author, GroupItem } from '@/lib/types';
import RichText from '@/components/RichText';
import Portal from '@/components/Portal';
import GroupPlans from '@/components/GroupPlans';
import GroupChat from '@/components/GroupChat';
import { Glyph, IconArrowLeft, IconBroadcast, IconUsers } from '@/components/icons';

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  city?: string;
  role: string;
}

interface Post {
  id: string;
  body: string;
  createdAt: string;
  user: Author;
}

interface GroupDetail extends GroupItem {
  members: Member[];
  posts: Post[];
  announcement?: string;
  announcedAt?: string | null;
}

function Avatar({ user, size = 40 }: { user: Author; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{ backgroundColor: user.avatarColor || '#3d52d9', width: size, height: size, fontSize: size * 0.4 }}
    >
      {(user.displayName || user.username || '?').slice(0, 1)}
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = { owner: '团长', admin: '管理员', moderator: '管理', member: '成员' };

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();
  const [postError, setPostError] = useState('');
  const [ownerExitOpen, setOwnerExitOpen] = useState(false);

  const { data, loading, error, setData } = useApi<GroupDetail>(id ? `/groups/${id}` : null, [id]);
  const joinAction = useAction();
  const exitAction = useAction();
  const postAction = useAction();
  const [postBody, setPostBody] = useState('');
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  const isOwner = !!data && !!user && data.owner?.id === user.id;

  const toggleJoin = useCallback(async () => {
    if (!data) return;
    if (!user) {
      notice.info('请先登录后再加入团契');
      goLogin();
      return;
    }
    if (data.joined && isOwner) {
      // 团长退出需要先决定团契归属，弹层里二选一
      setOwnerExitOpen(true);
      return;
    }
    let res;
    if (data.joined) {
      res = await joinAction.run(() => apiDelete<{ joined: boolean; memberCount: number }>(`/groups/${data.id}/join`));
    } else {
      res = await joinAction.run(() => apiPost<{ joined: boolean; memberCount: number }>(`/groups/${data.id}/join`));
    }
    if (res) {
      setData((prev) =>
        prev ? { ...prev, joined: res.joined, memberCount: res.memberCount } : prev
      );
    }
  }, [data, user, isOwner, joinAction, goLogin, notice, setData]);

  /** 团长：按选定去向退出（transfer = 移交最早入群者；dissolve = 退出并解散） */
  const exitAsOwner = useCallback(
    async (mode: 'transfer' | 'dissolve') => {
      if (!data) return;
      const res = await exitAction.run(() =>
        apiDelete<{
          joined: boolean;
          memberCount: number;
          transferred: boolean;
          newOwnerId: string | null;
          dissolved: boolean;
        }>(`/groups/${data.id}/join`, { mode }),
      );
      if (res) {
        setOwnerExitOpen(false);
        if (res.dissolved) {
          notice.success('团契已解散');
          router.push('/groups');
          return;
        }
        notice.success('已退出，团长身份已移交给最早入群的成员');
        router.refresh();
        setData((prev) => (prev ? { ...prev, joined: false, memberCount: res.memberCount } : prev));
      }
    },
    [data, exitAction, notice, router, setData],
  );

  /** 团长独自一人时：唯一选项「退出并解散」，弹框二次确认 */
  const soloExitOpen = ownerExitOpen && !!data && data.memberCount <= 1;

  // Esc 退出弹层，判据与遮罩点击一致：请求进行中不许关
  useEscape(ownerExitOpen || announcementOpen, () => {
    if (ownerExitOpen) {
      if (!exitAction.pending) setOwnerExitOpen(false);
    } else if (!announcementSaving) {
      setAnnouncementOpen(false);
    }
  });
  // 焦点管理要写在下面的 loading/!data 早返回之前，否则 hook 数量会随渲染变化
  const ownerExitRef = useDialogFocus(ownerExitOpen);
  const ownerExitTitleId = useId();
  const announcementRef = useDialogFocus(announcementOpen);
  const announcementTitleId = useId();

  const confirmSoloDissolve = useCallback(async () => {
    if (!data) return;
    const res = await exitAction.run(() => apiPost(`/groups/${data.id}/dissolve`));
    if (res) {
      setOwnerExitOpen(false);
      notice.success('团契已解散');
      router.push('/groups');
    }
  }, [data, exitAction, notice, router]);

  const submitPost = useCallback(async () => {
    if (!data) return;
    setPostError('');
    if (!user) {
      notice.info('请先登录后再发言');
      goLogin();
      return;
    }
    if (!data.joined) {
      setPostError('请先加入团契后再发言');
      notice.error('请先加入团契后再发言');
      return;
    }
    const body = postBody.trim();
    if (!body) return;
    const res = await postAction.run(() =>
      apiPost<Post>(`/groups/${data.id}/posts`, { body })
    );
    if (res) {
      setPostBody('');
      setData((prev) =>
        prev ? { ...prev, posts: [res, ...prev.posts] } : prev
      );
    }
  }, [data, user, postBody, postAction, goLogin, notice, setData]);

  const saveAnnouncement = useCallback(async () => {
    if (!data) return;
    setAnnouncementSaving(true);
    try {
      const r = await apiPatch<{ announcement: string; announcedAt: string | null }>(`/groups/${data.id}`, {
        announcement: announcementDraft,
      });
      setData((prev) =>
        prev ? { ...prev, announcement: r.announcement, announcedAt: r.announcedAt } : prev
      );
      setAnnouncementOpen(false);
      notice.success(r.announcement ? '群公告已更新' : '群公告已清除');
    } finally {
      setAnnouncementSaving(false);
    }
  }, [data, announcementDraft, notice, setData]);

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="h-32 rounded-3xl bg-ink-100 skeleton-sheen" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 h-72 rounded-3xl bg-ink-100 skeleton-sheen" />
            <div className="h-72 rounded-3xl bg-ink-100 skeleton-sheen" />
          </div>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="bg-white rounded-3xl border border-dashed border-ink-200 px-8 py-10 text-center max-w-sm w-full">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-ink-50 text-ink-400 items-center justify-center mb-3">
            <IconUsers className="w-6 h-6" strokeWidth={1.6} />
          </span>
          <p className="text-ink-500 text-sm mb-5">{error || '团契不存在'}</p>
          <Link href="/groups" className="btn-secondary">
            返回团契列表
          </Link>
        </div>
      </div>
    );
  }

  const isMember = data.joined;

  return (
    <div className="min-h-screen">
      {/* 头部 */}
      <section className="relative py-10 md:py-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-6 right-10 w-64 h-64 bg-primary-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-10 w-64 h-64 bg-gold-400/15 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/groups" className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm min-h-[44px] transition-colors">
            <IconArrowLeft className="w-4 h-4" strokeWidth={1.6} />
            返回团契列表
          </Link>
          <div className="mt-2 flex items-start gap-4">
            <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white flex-shrink-0 border border-white/25">
              <Glyph glyph={data.cover || '👥'} className="w-9 h-9" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{data.name}</h1>
              <p className="text-white/80 mt-2 text-sm leading-relaxed">{data.description}</p>
              <div className="flex items-center gap-3 mt-3 text-white/70 text-sm">
                <span><span className="num font-semibold text-white/90">{data.memberCount}</span> 成员</span>
                <span>·</span>
                <span>{data.city || '线上'}</span>
                {data.category && (
                  <>
                    <span>·</span>
                    <span>{groupCategoryLabel(data.category)}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={toggleJoin}
              disabled={joinAction.pending}
              className={`px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex-shrink-0 transition-colors ${
                isMember ? 'bg-white/15 text-white border border-white/30 hover:bg-white/25' : 'btn-gold'
              }`}
            >
              {joinAction.pending ? '处理中…' : isMember ? (isOwner ? '退出团契（团长）' : '退出团契') : '加入团契'}
            </button>
          </div>
        </div>
      </section>

      {/* 群公告横幅 */}
      {(data.announcement || isOwner) && (
        <section className="py-4">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {data.announcement ? (
              <div data-spot className="spot relative rounded-2xl bg-gold-50 border border-gold-200 px-5 py-4">
                <div className="flex items-start gap-3">
                  <IconBroadcast className="w-5 h-5 text-gold-600 flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-gold-700">群公告</span>
                      <span className="text-[10px] text-gold-500">
                        {data.announcedAt ? timeAgo(data.announcedAt) : ''}
                      </span>
                    </div>
                    <RichText
                      text={data.announcement}
                      className="block text-sm text-ink-700 leading-relaxed whitespace-pre-wrap break-words"
                    />
                  </div>
                </div>
                {isOwner && (
                  <button
                    onClick={() => {
                      setAnnouncementDraft(data.announcement || '');
                      setAnnouncementOpen(true);
                    }}
                    className="absolute top-3 right-3 text-xs text-gold-600 hover:text-gold-800 px-2.5 py-2 rounded-lg transition-colors"
                  >
                    编辑
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-ink-200 px-5 py-4 flex items-center justify-between">
                <span className="text-sm text-ink-400">还没有群公告</span>
                {isOwner && (
                  <button
                    onClick={() => {
                      setAnnouncementDraft('');
                      setAnnouncementOpen(true);
                    }}
                    className="text-xs px-3.5 py-2 min-h-[36px] rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors font-medium"
                  >
                    发布群公告
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-6">
          {/* 动态流 */}
          <div className="md:col-span-2 space-y-4">
            <div data-spot className="spot bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
              <div className="flex items-center gap-2.5 mb-4">
                <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-500 to-gold-500" />
                <h2 className="font-display text-lg md:text-xl font-bold text-ink-900">团契动态</h2>
              </div>
              {postError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 mb-4">
                  {postError}
                </div>
              )}
              {isMember ? (
                <div className="flex gap-2 mb-5">
                  <input
                    aria-label="分享团契近况"
                    value={postBody}
                    onChange={(e) => setPostBody(e.target.value)}
                    placeholder="分享团契里的近况…"
                    className="input-styled"
                    onKeyDown={(e) => e.key === 'Enter' && submitPost()}
                  />
                  <button onClick={submitPost} disabled={postAction.pending} className="btn-primary px-5 min-h-[44px] flex-shrink-0">
                    发布
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-400 mb-5">加入团契后即可发布动态</p>
              )}
              {postAction.error && <p className="text-rose-600 text-sm mb-3">{postAction.error}</p>}

              {data.posts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-ink-200 px-6 py-10 text-center">
                  <p className="text-ink-400 text-sm">还没有动态，来发布第一条吧～</p>
                </div>
              )}
              <div data-reveal-group className="space-y-4">
                {data.posts.map((p) => (
                  <div key={p.id} data-spot className="spot flex gap-3 p-4 rounded-2xl bg-ink-50/60 border border-ink-100 transition-colors hover:border-ink-200">
                    <Avatar user={p.user} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900 text-sm">{p.user.displayName}</span>
                        <span className="text-xs text-ink-400">{timeAgo(p.createdAt)}</span>
                      </div>
                      <RichText text={p.body} className="block text-ink-700 text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 成员列表 */}
          <div className="space-y-4">
            <div data-spot className="spot bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
              <div className="flex items-center gap-2.5 mb-4">
                <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-500 to-gold-500" />
                <h2 className="font-display text-lg md:text-xl font-bold text-ink-900">
                  成员 <span className="num text-ink-400 text-base font-semibold">({data.members.length})</span>
                </h2>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Avatar user={m} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-900 text-sm truncate">{m.displayName}</p>
                      <p className="text-xs text-ink-400">{m.city || ''}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 flex-shrink-0">
                      {ROLE_LABEL[m.role] || '成员'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 群聊 */}
      <section className="pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <GroupChat groupId={data.id} isMember={isMember} isOwner={isOwner} />
        </div>
      </section>

      {/* 小组共读 */}
      <GroupPlans groupId={data.id} isOwner={isOwner} isMember={isMember} />

      {/* 团长退出：先决定团契归属 */}
      {ownerExitOpen && (
        <Portal>
          <div
            ref={ownerExitRef}
            data-guard="owner-exit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={ownerExitTitleId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(17,24,39,0.45)' }}
            onClick={() => !exitAction.pending && setOwnerExitOpen(false)}
          >
            <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              {/* 两种文案互斥渲染，不会同时出现，故共用一个标题 id */}
              {soloExitOpen ? (
                <>
                  <h3 id={ownerExitTitleId} className="font-display text-xl font-bold text-ink-900 mb-1">退出并解散团契</h3>
                  <p className="text-sm text-ink-500 mb-4">
                    「{data.name}」目前只有你一人。退出后
                    <span className="text-rose-700 font-semibold">团契将会被解散</span>
                    ，团契信息与动态一并删除，且不可恢复。
                  </p>
                  <p className="text-xs text-ink-600 mb-4 rounded-xl bg-ink-50 border border-ink-100 px-4 py-3">
                    如果还想继续这个团契，可以留在这里等人加入，或先邀请成员后再退出。
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={exitAction.pending}
                      onClick={() => setOwnerExitOpen(false)}
                      className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={exitAction.pending}
                      onClick={confirmSoloDissolve}
                      className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {exitAction.pending ? '处理中…' : '退出并解散'}
                    </button>
                  </div>
                  {exitAction.error ? <p className="text-rose-600 text-xs mt-2 text-center">{exitAction.error}</p> : null}
                </>
              ) : (
                <>
                  <h3 id={ownerExitTitleId} className="font-display text-xl font-bold text-ink-900 mb-1">退出团契</h3>
                  <p className="text-sm text-ink-500 mb-4">
                    你是「{data.name}」的团长。团长退出前需要先决定这个团契的归属：
                  </p>

                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled={exitAction.pending}
                      onClick={() => exitAsOwner('transfer')}
                      className="w-full text-left rounded-xl border border-ink-200 hover:border-primary-400 hover:bg-primary-50/50 p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="font-semibold text-ink-900 text-sm">推荐：移交团长并退出</div>
                      <div className="text-xs text-ink-500 mt-1">
                        团长身份自动移交给最早入群的成员，团契与历史动态完整保留。
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={exitAction.pending}
                      onClick={() => exitAsOwner('dissolve')}
                      className="w-full text-left rounded-xl border border-rose-200 hover:border-rose-400 hover:bg-rose-50 p-4 transition-colors disabled:opacity-40"
                    >
                      <div className="font-semibold text-rose-700 text-sm">解散整个团契</div>
                      <div className="text-xs text-ink-500 mt-1">
                        团契、{data.memberCount} 名成员关系与全部动态将被删除，不可恢复。
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={exitAction.pending}
                    onClick={() => setOwnerExitOpen(false)}
                    className="mt-4 w-full py-2.5 min-h-[44px] rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition-colors"
                  >
                    {exitAction.pending ? '处理中…' : '取消'}
                  </button>
                  {exitAction.error ? <p className="text-rose-600 text-xs mt-2 text-center">{exitAction.error}</p> : null}
                </>
              )}
            </div>
          </div>
        </Portal>
      )}

      {/* 团长编辑群公告 */}
      {announcementOpen && (
        <Portal>
          <div
            ref={announcementRef}
            data-guard="announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={announcementTitleId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(17,24,39,0.45)' }}
            onClick={() => !announcementSaving && setAnnouncementOpen(false)}
          >
            <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 id={announcementTitleId} className="font-display text-xl font-bold text-ink-900 mb-1">群公告</h3>
              <p className="text-sm text-ink-500 mb-4">
                发布后将在团契顶部展示给所有成员。留空并保存即可清除公告。
              </p>
              <textarea
                aria-label="群公告"
                value={announcementDraft}
                onChange={(e) => setAnnouncementDraft(e.target.value)}
                maxLength={1000}
                rows={5}
                placeholder="例如：本周日团契聚会时间调整为下午 3 点…"
                className="input-styled w-full resize-none"
              />
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  disabled={announcementSaving}
                  onClick={() => setAnnouncementOpen(false)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={announcementSaving}
                  onClick={saveAnnouncement}
                  className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-50"
                >
                  {announcementSaving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
