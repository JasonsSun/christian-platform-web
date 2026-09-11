'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { useGoLogin } from '@/lib/nav';
import { timeAgo, formatDateTime } from '@/lib/format';
import type { Author, Comment, ContentItem, ListResult } from '@/lib/types';
import ShareButton from '@/components/ShareButton';

function Avatar({ user, size = 36 }: { user: Author; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{ backgroundColor: user.avatarColor || '#4f6df5', width: size, height: size, fontSize: size * 0.4 }}
    >
      {(user.displayName || user.username || '?').slice(0, 1)}
    </span>
  );
}

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();

  const { data, loading, error } = useApi<ContentItem>(id ? `/contents/${id}` : null, [id]);
  const {
    data: commentsData,
    loading: commentsLoading,
    setData: setComments,
  } = useApi<ListResult<Comment>>(id ? `/contents/${id}/comments` : null, [id]);
  const comments = commentsData?.items || [];

  const likeAction = useAction();
  const commentAction = useAction();
  const reportAction = useAction();
  const confirmNav = useConfirmNav();
  const [commentBody, setCommentBody] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetail, setReportDetail] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [fav, setFav] = useState(false);
  const favAction = useAction();

  const handleReport = useCallback(async () => {
    if (!user) {
      notice.info('请先登录后再举报');
      goLogin();
      return;
    }
    if (!reportReason) return;
    const res = await reportAction.run(() =>
      apiPost<{ ok: boolean }>(`/contents/${id}/report`, {
        reason: reportReason,
        detail: reportDetail.trim() || undefined,
      })
    );
    if (res) {
      setReportMsg('举报已提交');
      setShowReport(false);
      setReportDetail('');
    }
  }, [user, reportReason, reportDetail, reportAction, id, goLogin, notice]);

  const handleLike = useCallback(async () => {
    if (!data) return;
    if (!user) {
      notice.info('请先登录后再点赞');
      goLogin();
      return;
    }
    const res = await likeAction.run(() => apiPost<{ liked: boolean; likeCount: number }>(`/contents/${data.id}/like`));
    if (res && data) {
      data.liked = res.liked;
      data.likeCount = res.likeCount;
    }
  }, [data, user, likeAction, goLogin, notice]);

  const handleFavorite = useCallback(async () => {
    if (!data) return;
    if (!user) {
      notice.info('请先登录后再收藏');
      goLogin();
      return;
    }
    const res = await favAction.run(() => apiPost<{ favorited: boolean }>(`/contents/${data.id}/favorite`));
    if (res) setFav(res.favorited);
  }, [data, user, favAction, goLogin, notice]);

  const submitComment = useCallback(async () => {
    if (!data) return;
    if (!user) {
      notice.info('请先登录后再评论');
      goLogin();
      return;
    }
    const body = commentBody.trim();
    if (!body) return;
    const res = await commentAction.run(() => apiPost<Comment>(`/contents/${data.id}/comments`, { body }));
    if (res) {
      setCommentBody('');
      setComments((prev) => ({
        items: [...(prev?.items || []), res],
        total: (prev?.total || 0) + 1,
        page: prev?.page || 1,
        pageSize: prev?.pageSize || 20,
      }));
      data.commentCount = (data.commentCount || 0) + 1;
    }
  }, [data, user, commentBody, commentAction, goLogin, notice, setComments]);

  /** 能否删除这条评论：本人 / 内容作者 / 审核员·管理员 */
  const canDeleteComment = useCallback(
    (c: Comment) => {
      if (!user) return false;
      if (c.user.id === user.id) return true;
      if (user.role === 'admin' || user.role === 'moderator') return true;
      return !!data && data.author?.id === user.id;
    },
    [user, data]
  );

  /**
   * 删除评论：本系统禁止弹框，所以走「跳转式确认页 /confirm」，
   * 确认后执行删除并回跳本页（本页重新挂载会自动刷新评论列表）。
   */
  const askDeleteComment = useCallback(
    (c: Comment) => {
      if (!data) return;
      const mine = c.user.id === user?.id;
      confirmNav({
        title: '删除评论',
        desc: mine
          ? '确定删除这条评论吗？删除后不可恢复。'
          : `确定删除「${c.user.displayName}」的这条评论吗？删除后不可恢复。`,
        confirmText: '删除',
        cancelText: '取消',
        danger: true,
        back: `/contents/${data.id}`,
        action: 'comment.delete',
        params: { contentId: data.id, commentId: c.id },
        onConfirm: async () => {
          await apiDelete<{ id: string; deleted: boolean }>(`/contents/${data.id}/comments/${c.id}`);
          notice.success('评论已删除');
        },
      });
    },
    [data, user, confirmNav, notice]
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-400">加载中…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ink-500">
        <p>{error || '内容不存在'}</p>
        <Link href="/community" className="btn-secondary">
          返回社区
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <section className="relative py-8 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/community" className="text-white/80 text-sm hover:text-white">
            ← 返回社区
          </Link>

          {/* 分享 + 举报入口 */}
          <div className="absolute top-0 right-4 sm:right-6 flex items-center gap-3">
            <ShareButton
              title={data ? `见证 · ${data.title}` : '圣约社区 · 见证'}
              text={data ? `推荐给你一篇主内见证「${data.title}」，愿与你一同分享。` : '推荐给你圣约社区的一篇主内见证。'}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            />
            {reportMsg ? (
              <span className="inline-flex items-center gap-1 text-white/90 bg-emerald-500/30 px-3 py-1.5 rounded-full text-sm">
                ✓ {reportMsg}
              </span>
            ) : (
              <button
                onClick={() => setShowReport((v) => !v)}
                className="text-white/80 hover:text-white text-sm underline-offset-2 hover:underline"
              >
                举报
              </button>
            )}
            {showReport && !reportMsg && (
              <div className="absolute right-0 mt-2 w-64 sm:w-72 glass rounded-2xl p-4 shadow-card z-20 text-ink-800">
                {!user ? (
                  <div className="text-sm text-ink-600">
                    请先
                    <button onClick={() => router.push('/login')} className="text-primary-600 font-medium mx-1">登录</button>
                    后举报
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink-500 mb-1">举报原因</label>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="input-styled"
                      >
                        <option value="spam">垃圾广告</option>
                        <option value="harmful">有害信息</option>
                        <option value="heresy">异端偏差</option>
                        <option value="copyright">侵权</option>
                        <option value="offensive">冒犯性内容</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-500 mb-1">补充说明（选填）</label>
                      <textarea
                        value={reportDetail}
                        onChange={(e) => setReportDetail(e.target.value)}
                        className="input-styled min-h-[64px]"
                        placeholder="请描述具体问题…"
                      />
                    </div>
                    {reportAction.error && <p className="text-xs text-rose-500">{reportAction.error}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setShowReport(false)} className="btn-secondary flex-1 text-sm py-2">取消</button>
                      <button
                        onClick={handleReport}
                        disabled={reportAction.pending}
                        className="btn-primary flex-1 text-sm py-2 disabled:opacity-70"
                      >
                        {reportAction.pending ? '提交中…' : '提交'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            {data.cover && <span className="text-4xl">{data.cover}</span>}
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug">{data.title}</h1>
          </div>
          <div className="flex items-center gap-3 mt-4 text-white/80 text-sm">
            <Avatar user={data.author} size={32} />
            <span className="text-white font-medium">{data.author.displayName}</span>
            <span>·</span>
            <span>{formatDateTime(data.publishedAt || data.createdAt)}</span>
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100">
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  data.liked ? 'bg-rose-50 text-rose-500 border border-rose-200' : 'bg-ink-50 text-ink-600 border border-ink-200 hover:border-rose-200'
                }`}
              >
                <svg className="w-5 h-5" fill={data.liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {data.likeCount} 赞
              </button>
              <button
                onClick={handleFavorite}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  fav ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-ink-50 text-ink-600 border border-ink-200 hover:border-amber-200'
                }`}
              >
                <svg className="w-5 h-5" fill={fav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                  {fav ? '已收藏' : '收藏'}
                </button>
                <span className="text-sm text-ink-400">{data.viewCount} 浏览</span>
                {user && data.author?.id === user.id && (
                  <Link
                    href={`/community/create?edit=${data.id}`}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-ink-50 text-ink-600 border border-ink-200 hover:border-primary-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  编辑
                </Link>
                )}
              </div>

            <div className="divider-gradient mb-5" />

            <article className="whitespace-pre-wrap text-ink-800 leading-relaxed text-[15px]">{data.body}</article>

            {data.media && data.media.length > 0 && (
              <div className="mt-6 space-y-4">
                {data.media.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-ink-100 overflow-hidden bg-ink-50/50">
                    {m.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={m.url} alt={m.title} className="w-full max-h-[520px] object-contain bg-white" />
                    ) : m.kind === 'video' ? (
                      <video src={m.url} controls className="w-full bg-black" />
                    ) : m.kind === 'audio' ? (
                      <div className="p-4">
                        <div className="text-sm text-ink-600 mb-2">🎵 {m.title}</div>
                        <audio src={m.url} controls className="w-full" />
                      </div>
                    ) : (
                      <a href={m.url} download={m.fileName} className="flex items-center gap-3 p-4 hover:bg-primary-50/50">
                        <span className="text-2xl">{m.kind === 'score' ? '🎼' : '📄'}</span>
                        <span className="text-sm text-ink-700 flex-1">{m.title}</span>
                        <span className="text-xs text-primary-600">下载</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.tags && data.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6">
                {data.tags.map((t) => (
                  <span key={t} className="px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* 作者信息卡 */}
            <div className="mt-8 flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-primary-50 to-primary-100/50 border border-primary-100">
              <Avatar user={data.author} size={48} />
              <div>
                <p className="font-semibold text-ink-900">{data.author.displayName}</p>
                <p className="text-sm text-ink-500">@{(data.author.username || '').slice(0, 16)}</p>
              </div>
            </div>
          </div>

          {/* 评论区 */}
          <div className="mt-6 bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100">
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">
              评论 {comments.length > 0 && <span className="text-ink-400 text-base">({comments.length})</span>}
            </h2>

            <div className="flex gap-2 mb-6">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={user ? '写下你的评论…' : '登录后可发表评论'}
                disabled={!user}
                className="input-styled"
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              />
              <button onClick={submitComment} disabled={!user || commentAction.pending} className="btn-primary px-5 flex-shrink-0">
                发送
              </button>
            </div>
            {commentAction.error && <p className="text-rose-500 text-sm mb-3">{commentAction.error}</p>}

            {commentsLoading && <div className="text-center py-4 text-ink-400">加载评论中…</div>}
            {!commentsLoading && comments.length === 0 && (
              <p className="text-center py-6 text-ink-400 text-sm">还没有评论，来抢沙发吧～</p>
            )}
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 group">
                  <Avatar user={c.user} size={36} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-900 text-sm">{c.user.displayName}</span>
                      <span className="text-xs text-ink-400">{timeAgo(c.createdAt)}</span>
                      {canDeleteComment(c) && (
                        <button
                          onClick={() => askDeleteComment(c)}
                          title="删除评论"
                          aria-label="删除评论"
                          className="ml-auto flex-shrink-0 text-xs text-ink-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg px-2.5 py-1.5 -mr-1 transition md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <p className="text-ink-700 text-sm mt-1 leading-relaxed">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
