'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { timeAgo } from '@/lib/format';
import type { Author, GroupItem } from '@/lib/types';

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
}

function Avatar({ user, size = 40 }: { user: Author; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{ backgroundColor: user.avatarColor || '#4f6df5', width: size, height: size, fontSize: size * 0.4 }}
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

  const { data, loading, error, setData } = useApi<GroupDetail>(id ? `/groups/${id}` : null, [id]);
  const joinAction = useAction();
  const postAction = useAction();
  const [postBody, setPostBody] = useState('');

  const toggleJoin = useCallback(async () => {
    if (!data) return;
    if (!user) {
      notice.info('请先登录后再加入团契');
      goLogin();
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
  }, [data, user, joinAction, goLogin, notice, setData]);

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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-400">加载中…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ink-500">
        <p>{error || '团契不存在'}</p>
        <Link href="/groups" className="btn-secondary">
          返回团契列表
        </Link>
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
          <Link href="/groups" className="text-white/80 text-sm hover:text-white">
            ← 返回团契列表
          </Link>
          <div className="mt-4 flex items-start gap-4">
            <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-5xl flex-shrink-0 border border-white/25">
              {data.cover || '👥'}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{data.name}</h1>
              <p className="text-white/80 mt-2 text-sm leading-relaxed">{data.description}</p>
              <div className="flex items-center gap-3 mt-3 text-white/70 text-sm">
                <span>{data.memberCount} 成员</span>
                <span>·</span>
                <span>{data.city || '线上'}</span>
                {data.category && (
                  <>
                    <span>·</span>
                    <span>{data.category}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={toggleJoin}
              disabled={joinAction.pending}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0 transition-all ${
                isMember ? 'bg-white/15 text-white border border-white/30 hover:bg-white/25' : 'btn-gold'
              }`}
            >
              {joinAction.pending ? '处理中…' : isMember ? '退出团契' : '加入团契'}
            </button>
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-6">
          {/* 动态流 */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
              <h2 className="font-display text-xl font-bold text-ink-900 mb-4">团契动态</h2>
              {postError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm px-4 py-3 mb-4">
                  {postError}
                </div>
              )}
              {isMember ? (
                <div className="flex gap-2 mb-5">
                  <input
                    value={postBody}
                    onChange={(e) => setPostBody(e.target.value)}
                    placeholder="分享团契里的近况…"
                    className="input-styled"
                    onKeyDown={(e) => e.key === 'Enter' && submitPost()}
                  />
                  <button onClick={submitPost} disabled={postAction.pending} className="btn-primary px-5 flex-shrink-0">
                    发布
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-400 mb-5">加入团契后即可发布动态</p>
              )}
              {postAction.error && <p className="text-rose-500 text-sm mb-3">{postAction.error}</p>}

              {data.posts.length === 0 && (
                <p className="text-center py-6 text-ink-400 text-sm">还没有动态，来发布第一条吧～</p>
              )}
              <div className="space-y-4">
                {data.posts.map((p) => (
                  <div key={p.id} className="flex gap-3 p-4 rounded-2xl bg-ink-50/60 border border-ink-100">
                    <Avatar user={p.user} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900 text-sm">{p.user.displayName}</span>
                        <span className="text-xs text-ink-400">{timeAgo(p.createdAt)}</span>
                      </div>
                      <p className="text-ink-700 text-sm mt-1 leading-relaxed whitespace-pre-wrap">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 成员列表 */}
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
              <h2 className="font-display text-xl font-bold text-ink-900 mb-4">
                成员 <span className="text-ink-400 text-base">({data.members.length})</span>
              </h2>
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
    </div>
  );
}
