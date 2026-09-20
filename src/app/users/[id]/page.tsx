'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { apiPost, apiDelete } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, timeAgo } from '@/lib/format';
import BadgeWall from '@/components/BadgeWall';
import type { Author, ContentItem } from '@/lib/types';
import { Glyph, IconPencil } from '@/components/icons';

type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarColor: string;
  bio: string;
  city: string;
  church: string;
  createdAt: string;
  following: boolean;
  isMe: boolean;
  blocked: boolean;
  stats: { contents: number; followers: number; following: number; activities: number };
  contents: ContentItem[];
};

function ContentCard({ item }: { item: ContentItem }) {
  return (
    <Link href={`/contents/${item.id}`} className="card-hover bg-white rounded-2xl p-5 border border-ink-100 shadow-soft hover:shadow-card-hover flex gap-4">
      {item.cover ? (
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center flex-shrink-0">
          <Glyph glyph={item.cover} className="w-8 h-8 text-primary-700" strokeWidth={1.4} />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <h2 className="font-display font-bold text-lg text-ink-900 truncate">{item.title}</h2>
        <p className="text-sm text-ink-500 line-clamp-2 mt-1">{item.excerpt || item.body?.slice(0, 80)}</p>
        <div className="flex items-center gap-4 mt-3 text-sm text-ink-500">
          <span>{timeAgo(item.publishedAt || item.createdAt)}</span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            <span className="sr-only">点赞</span>{item.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h6m-6 6h8a2 2 0 002-2V8l-4-4H8a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="sr-only">评论</span>{item.commentCount}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            <span className="sr-only">阅读</span>{item.viewCount}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user: me } = useAuth();

  const { data, loading, error, setData } = useApi<UserProfile>(`/users/${id}`);
  const followAction = useAction();
  const blockAction = useAction();

  const [tab, setTab] = useState<'activities' | 'about' | 'badges'>('activities');

  const handleFollow = async () => {
    if (!me) {
      router.push('/login');
      return;
    }
    if (!data) return;
    const following = data.following;
    const res = following
      ? await followAction.run(() => apiDelete<{ following: boolean; followers: number }>(`/users/${id}/follow`))
      : await followAction.run(() => apiPost<{ following: boolean; followers: number }>(`/users/${id}/follow`));
    if (res) {
      setData((prev) => (prev ? { ...prev, following: res.following, stats: { ...prev.stats, followers: res.followers } } : prev));
    }
  };

  const handleBlock = async () => {
    if (!me) {
      router.push('/login');
      return;
    }
    if (!data) return;
    const blocked = data.blocked;
    const res = blocked
      ? await blockAction.run(() => apiDelete<{ blocked: boolean; blockedCount: number }>(`/users/${id}/block`))
      : await blockAction.run(() => apiPost<{ blocked: boolean; blockedCount: number }>(`/users/${id}/block`));
    if (res) {
      setData((prev) => (prev ? { ...prev, blocked: res.blocked, following: false } : prev));
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 资料卡 */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm mb-6">加载失败：{error}</div>
        )}

        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-40 bg-ink-100 rounded-3xl" />
            <div className="h-24 bg-ink-100 rounded-2xl" />
          </div>
        )}

        {!loading && data && (
          <>
            <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-card">
              <div className="absolute top-4 right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                <span
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white flex-shrink-0 shadow-lg"
                  style={{ backgroundColor: data.avatarColor || '#3d52d9' }}
                >
                  {(data.displayName || data.username || '?').slice(0, 1)}
                </span>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-2xl md:text-3xl font-bold">{data.displayName}</h1>
                  <p className="text-white/90 text-sm mt-1">@{data.username}</p>
                  {(data.city || data.church) && (
                    <p className="text-white/80 text-sm mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {data.city && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {data.city}
                        </span>
                      )}
                      {data.church && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01" /></svg>
                          {data.church}
                        </span>
                      )}
                    </p>
                  )}
                  {data.bio && <p className="text-white/85 text-sm mt-3 leading-relaxed">{data.bio}</p>}
                  <p className="text-white/85 text-xs mt-3">加入于 {formatDate(data.createdAt)}</p>
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                  {data.isMe ? (
                    <Link href="/me" className="btn-secondary px-6 py-2.5 text-sm inline-block">编辑资料</Link>
                  ) : me ? (
                    <>
                      <button
                        onClick={handleFollow}
                        disabled={followAction.pending}
                        className={`px-6 py-2.5 text-sm rounded-xl font-medium transition-all disabled:opacity-60 ${
                          data.following ? 'bg-white/15 text-white border border-white/30 hover:bg-white/25' : 'bg-white text-primary-700 hover:bg-primary-50'
                        }`}
                      >
                        {followAction.pending ? '处理中…' : data.following ? '已关注' : '关注'}
                      </button>
                      <button
                        onClick={handleBlock}
                        disabled={blockAction.pending}
                        title={data.blocked ? '取消屏蔽' : '屏蔽该用户'}
                        className={`px-4 py-2.5 text-sm rounded-xl font-medium transition-all disabled:opacity-60 ${
                          data.blocked ? 'bg-rose-600/90 text-white hover:bg-rose-600' : 'bg-white/10 text-white/90 border border-white/25 hover:bg-white/20'
                        }`}
                      >
                        {blockAction.pending ? '…' : data.blocked ? '已屏蔽' : '屏蔽'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => router.push('/login')} className="btn-secondary px-6 py-2.5 text-sm">关注</button>
                  )}
                </div>
              </div>

              {/* 统计行 */}
              <div className="relative mt-6 grid grid-cols-4 gap-2 border-t border-white/15 pt-5">
                <div className="text-center">
                  <div className="font-display text-xl md:text-2xl font-bold">{data.stats.contents}</div>
                  <div className="text-white/85 text-xs mt-1">内容</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-xl md:text-2xl font-bold">{data.stats.followers}</div>
                  <div className="text-white/85 text-xs mt-1">粉丝</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-xl md:text-2xl font-bold">{data.stats.following}</div>
                  <div className="text-white/85 text-xs mt-1">关注</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-xl md:text-2xl font-bold">{data.stats.activities}</div>
                  <div className="text-white/85 text-xs mt-1">活动</div>
                </div>
              </div>
            </section>

            {/* Tab */}
            <div className="flex gap-2 mt-6 mb-5">
              <button
                onClick={() => setTab('activities')}
                className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${
                  tab === 'activities' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25' : 'bg-white text-ink-600 border border-ink-200 hover:border-primary-300'
                }`}
              >
                动态
              </button>
              <button
                onClick={() => setTab('about')}
                className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${
                  tab === 'about' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25' : 'bg-white text-ink-600 border border-ink-200 hover:border-primary-300'
                }`}
              >
                关于
              </button>
              <button
                onClick={() => setTab('badges')}
                className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${
                  tab === 'badges' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25' : 'bg-white text-ink-600 border border-ink-200 hover:border-primary-300'
                }`}
              >
                成就
              </button>
            </div>

            {followAction.error && <p className="text-rose-600 text-sm mb-4">{followAction.error}</p>}

            {tab === 'activities' ? (
              data.contents.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 shadow-soft border border-ink-100 text-center">
                  <div className="w-16 h-16 mb-4 rounded-2xl bg-primary-50 text-primary-600 grid place-items-center mx-auto"><IconPencil className="w-8 h-8" strokeWidth={1.4} /></div>
                  <h2 className="font-display text-xl font-bold text-ink-900 mb-2">还没有发布的内容</h2>
                  <p className="text-ink-500">TA 暂时没有公开的内容</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.contents.map((item) => (
                    <ContentCard key={item.id} item={item} />
                  ))}
                </div>
              )
            ) : tab === 'badges' ? (
              <BadgeWall userId={data.id} />
            ) : (
              <div className="bg-white rounded-2xl p-6 md:p-8 shadow-soft border border-ink-100 space-y-5">
                <div className="divider-gradient" />
                <div className="flex items-start gap-3">
                  <span className="text-ink-400 w-20 flex-shrink-0 text-sm">简介</span>
                  <p className="text-ink-700 leading-relaxed flex-1">{data.bio || '这个人很神秘，什么都没留下～'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-400 w-20 flex-shrink-0 text-sm">城市</span>
                  <p className="text-ink-700 flex-1">{data.city || '未填写'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-400 w-20 flex-shrink-0 text-sm">教会</span>
                  <p className="text-ink-700 flex-1">{data.church || '未填写'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-400 w-20 flex-shrink-0 text-sm">加入时间</span>
                  <p className="text-ink-700 flex-1">{formatDate(data.createdAt)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
