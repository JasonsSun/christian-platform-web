'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { useConfirmNav } from '@/lib/confirm';
import { timeAgo } from '@/lib/format';
import type { FriendStatus, FriendRequestItem, FriendItem } from '@/lib/types';

interface UserCard {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarColor: string;
  bio?: string;
  city?: string;
  church?: string;
  followers: number;
  contents: number;
  following: boolean;
  friendStatus: FriendStatus;
}

type Tab = 'discover' | 'friends' | 'requests';

function Avatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

/** 申请终态文案:pending 之外的记录一律以静态标签呈现,不再给可点击按钮 */
const REQUEST_STATUS_LABEL: Record<string, string> = {
  accepted: '已接受',
  declined: '已忽略',
  cancelled: '已取消',
};

function RequestRow({
  r,
  busy,
  onHandle,
}: {
  r: FriendRequestItem;
  busy: string;
  onHandle: (r: FriendRequestItem, action: 'accept' | 'decline') => void;
}) {
  const isPending = r.status === 'pending';
  const label = REQUEST_STATUS_LABEL[r.status] || '已处理';
  const working = busy === `accept:${r.id}` || busy === `decline:${r.id}`;

  return (
    <div className={`bg-white rounded-2xl p-4 border border-ink-100 shadow-soft flex gap-3 items-center ${isPending ? '' : 'opacity-80'}`}>
      <Link href={`/users/${r.peer.id}`}><Avatar name={r.peer.displayName} color={r.peer.avatarColor} size={52} /></Link>
      <div className="min-w-0 flex-1">
        <Link href={`/users/${r.peer.id}`} className="font-semibold text-ink-900 hover:text-primary-600">{r.peer.displayName}</Link>
        <p className="text-xs text-ink-500">{r.peer.city || '—'}{r.peer.church ? ` · ${r.peer.church}` : ''}</p>
        {r.message && <p className="text-sm text-ink-700 mt-1 italic">“{r.message}”</p>}
        <p className="text-xs text-ink-400 mt-1">{timeAgo(r.createdAt)}</p>
      </div>
      <div className="flex gap-2 self-center flex-shrink-0">
        {isPending ? (
          <>
            <button
              onClick={() => onHandle(r, 'accept')}
              disabled={working}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy === `accept:${r.id}` ? '处理中…' : '接受'}
            </button>
            <button
              onClick={() => onHandle(r, 'decline')}
              disabled={working}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy === `decline:${r.id}` ? '处理中…' : '忽略'}
            </button>
          </>
        ) : (
          <span
            aria-disabled="true"
            className={`px-4 py-2 text-sm rounded-xl select-none border ${
              r.status === 'accepted'
                ? 'bg-primary-50 text-primary-700 border-primary-100'
                : 'bg-ink-100 text-ink-500 border-ink-200'
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();
  const confirmNav = useConfirmNav();
  const [tab, setTab] = useState<Tab>('discover');
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState('');

  // 从 URL ?tab= 初始化(来自 Navbar 角标跳转)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'friends' || t === 'requests' || t === 'discover') setTab(t);
  }, []);

  const disc = useApi<{ items: UserCard[]; total: number }>(
    tab === 'discover' ? `/users${qs({ q, city, pageSize: 30 })}` : null,
    [tab, q, city, nonce]
  );
  const friends = useApi<{ items: FriendItem[]; total: number }>(
    tab === 'friends' ? '/friends' : null,
    [tab, nonce]
  );
  const requests = useApi<{ items: FriendRequestItem[]; total: number; pendingTotal?: number; handledTotal?: number }>(
    tab === 'requests' ? '/friends/requests?type=incoming' : null,
    [tab, nonce]
  );
  const pending = useApi<{ total: number; pendingTotal?: number }>(
    user ? '/friends/requests?type=incoming&pageSize=1' : null,
    [user?.id, nonce]
  );

  const follow = useAction();

  function refresh() {
    setNonce((n) => n + 1);
  }

  async function doBusy(label: string, fn: () => Promise<any>) {
    setBusy(label);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      notice.error(e?.message || '操作失败');
    } finally {
      setBusy('');
    }
  }

  async function sendRequest(u: UserCard) {
    if (!user) { notice.info('请先登录'); goLogin(); return; }
    await doBusy(`add:${u.id}`, () =>
      apiPost<{ ok: boolean }>('/friends/request', { addresseeId: u.id })
    );
  }

  async function toggleFollow(u: UserCard) {
    if (!user) { notice.info('请先登录'); goLogin(); return; }
    const optimistic = disc.data
      ? { ...disc.data, items: disc.data.items.map((x) => x.id === u.id ? { ...x, following: !x.following, followers: x.followers + (x.following ? -1 : 1) } : x) }
      : disc.data;
    disc.setData(optimistic);
    const res = await follow.run(() =>
      u.following ? apiDelete(`/users/${u.id}/follow`) : apiPost<{ following: boolean; followers: number }>(`/users/${u.id}/follow`)
    );
    if (!res) refresh();
  }

  /** 处理完成后立刻把该条置为终态:按钮随即变成「已接受 / 已忽略」,不等列表刷新 */
  function markHandled(id: string, status: 'accepted' | 'declined') {
    const cur = requests.data;
    if (!cur) return;
    const nextPending = Math.max(0, (cur.pendingTotal ?? cur.total ?? 0) - 1);
    requests.setData({
      ...cur,
      items: cur.items.map((x) => (x.id === id ? { ...x, status } : x)),
      total: nextPending,
      pendingTotal: nextPending,
      handledTotal: (cur.handledTotal ?? 0) + 1,
    });
  }

  async function handleRequest(r: FriendRequestItem, action: 'accept' | 'decline') {
    setBusy(`${action}:${r.id}`);
    try {
      await apiPost(`/friends/requests/${r.id}/${action}`);
      markHandled(r.id, action === 'accept' ? 'accepted' : 'declined');
      if (action === 'accept') notice.success(`已接受 ${r.peer.displayName} 的好友申请`);
      else notice.info(`已忽略 ${r.peer.displayName} 的好友申请`);
    } catch (e: any) {
      const msg = e?.message || '操作失败';
      // 该申请已是终态(如另一标签页已处理):准确提示并刷新对齐真实状态
      if (/已被处理|已处理/.test(msg)) notice.info(msg);
      else notice.error(msg);
    } finally {
      setBusy('');
      refresh();
    }
  }
  async function removeFriend(f: FriendItem) {
    confirmNav({
      title: `解除与 ${f.displayName} 的好友关系`,
      desc: '解除后你们将不再是好友，需要重新发送好友申请才能恢复。',
      danger: true,
      confirmText: '确认解除',
      cancelText: '再想想',
      back: '/friends?tab=friends',
      action: 'friend.remove',
      params: { userId: f.id },
      onConfirm: async () => {
        await apiDelete(`/friends/${f.id}`);
        notice.success('已解除好友关系');
      },
    });
  }

  const pendingCount = pending.data?.pendingTotal ?? pending.data?.total ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">弟兄姐妹</h1>
      <p className="text-ink-500 mb-6">发现、关注并加好友,建立更紧密的信仰同行关系</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-ink-200">
        {([
          { k: 'discover', label: '发现' },
          { k: 'friends', label: '我的好友' },
          { k: 'requests', label: `好友申请${pendingCount ? ` (${pendingCount})` : ''}` },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.k ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ 发现 ============ */}
      {tab === 'discover' && (
        <>
          <div className="glass rounded-2xl p-4 shadow-card mb-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input className="input-styled flex-1" placeholder="搜索昵称 / 用户名 / 教会" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input-styled sm:w-40" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">全部城市</option>
                {CITIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
          </div>

          {disc.loading && (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-32 animate-pulse border border-ink-100" />))}
            </div>
          )}
          {disc.error && (
            <div className="text-center py-12"><p className="text-rose-600 mb-3">{disc.error}</p><button onClick={disc.reload} className="btn-secondary">重试</button></div>
          )}
          {!disc.loading && !disc.error && (disc.data?.items?.length ?? 0) === 0 && (
            <div className="text-center py-16"><div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">🔍</div><p className="text-ink-500">没有找到符合条件的用户</p></div>
          )}
          {!disc.loading && !disc.error && (disc.data?.items?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {disc.data!.items.map((u) => (
                <div key={u.id} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3">
                  <Link href={`/users/${u.id}`}><Avatar name={u.displayName} color={u.avatarColor} size={52} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/users/${u.id}`} className="font-semibold text-ink-900 hover:text-primary-600">{u.displayName}</Link>
                    <p className="text-xs text-ink-500">{u.city || '—'}{u.church ? ` · ${u.church}` : ''}</p>
                    <p className="text-sm text-ink-500 truncate mt-1">{u.bio || '这位弟兄/姐妹还没有填写简介'}</p>
                    <p className="text-xs text-ink-400 mt-1.5">{u.followers} 粉丝 · {u.contents} 内容</p>
                  </div>
                  <div className="flex flex-col gap-2 self-center">
                    {u.friendStatus === 'friends' ? (
                      <>
                        <span className="btn-secondary px-3 py-1.5 text-sm text-center opacity-70">已加好友</span>
                        <Link href={`/messages/${u.id}`} className="btn-primary px-3 py-1.5 text-sm text-center">私信</Link>
                      </>
                    ) : u.friendStatus === 'pending_sent' ? (
                      <span className="btn-secondary px-3 py-1.5 text-sm text-center opacity-70">已发送</span>
                    ) : u.friendStatus === 'pending_received' ? (
                      <Link href="/friends?tab=requests" className="btn-gold px-3 py-1.5 text-sm text-center">待你确认</Link>
                    ) : (
                      <button onClick={() => sendRequest(u)} disabled={busy === `add:${u.id}`} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60">
                        {busy === `add:${u.id}` ? '发送中…' : '加好友'}
                      </button>
                    )}
                    {user?.id !== u.id && (
                      <button onClick={() => toggleFollow(u)} disabled={follow.pending} className={`px-3 py-1 text-xs rounded-lg ${u.following ? 'text-ink-500 hover:text-rose-600' : 'text-primary-600 hover:text-primary-700'}`}>
                        {u.following ? '已关注' : '关注'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ 我的好友 ============ */}
      {tab === 'friends' && (
        <>
          {friends.loading && <div className="py-16 text-center text-ink-400">加载中…</div>}
          {friends.error && <div className="text-center py-12"><p className="text-rose-600 mb-3">{friends.error}</p><button onClick={friends.reload} className="btn-secondary">重试</button></div>}
          {!friends.loading && !friends.error && (friends.data?.items?.length ?? 0) === 0 && (
            <div className="text-center py-16"><div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">🤝</div><p className="text-ink-500">还没有好友,去「发现」里加好友吧</p></div>
          )}
          {!friends.loading && !friends.error && (friends.data?.items?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {friends.data!.items.map((f) => (
                <div key={f.id} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3 items-center">
                  <Link href={`/users/${f.id}`}><Avatar name={f.displayName} color={f.avatarColor} size={52} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/users/${f.id}`} className="font-semibold text-ink-900 hover:text-primary-600">{f.displayName}</Link>
                    <p className="text-xs text-ink-500">{f.city || '—'}{f.church ? ` · ${f.church}` : ''}</p>
                    <p className="text-xs text-ink-400 mt-1">互为好友 · {f.followers} 粉丝</p>
                  </div>
                  <div className="flex flex-col gap-2 self-center">
                    <Link href={`/messages/${f.id}`} className="btn-primary px-3 py-1.5 text-sm text-center">私信</Link>
                    <button onClick={() => removeFriend(f)} disabled={busy === `del:${f.id}`} className="px-3 py-1 text-xs text-ink-500 hover:text-rose-600 disabled:opacity-60">
                      {busy === `del:${f.id}` ? '处理中…' : '取消好友'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ 好友申请 ============ */}
      {tab === 'requests' && (
        <>
          {requests.loading && <div className="py-16 text-center text-ink-400">加载中…</div>}
          {requests.error && <div className="text-center py-12"><p className="text-rose-600 mb-3">{requests.error}</p><button onClick={requests.reload} className="btn-secondary">重试</button></div>}
          {!requests.loading && !requests.error && (requests.data?.items?.length ?? 0) === 0 && (
            <div className="text-center py-16"><div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">📭</div><p className="text-ink-500">暂无新的好友申请</p></div>
          )}
          {!requests.loading && !requests.error && (requests.data?.items?.length ?? 0) > 0 && (
            <>
              {(() => {
                const all = requests.data!.items;
                const pend = all.filter((r) => r.status === 'pending');
                const done = all.filter((r) => r.status !== 'pending');
                return (
                  <>
                    {pend.length > 0 && (
                      <div className="space-y-4">
                        {pend.map((r) => (
                          <RequestRow key={r.id} r={r} busy={busy} onHandle={handleRequest} />
                        ))}
                      </div>
                    )}
                    {done.length > 0 && (
                      <div className={pend.length > 0 ? 'mt-8' : ''}>
                        <p className="text-xs font-semibold text-ink-400 mb-3 tracking-wide">已处理（{done.length}）</p>
                        <div className="space-y-3">
                          {done.map((r) => (
                            <RequestRow key={r.id} r={r} busy={busy} onHandle={handleRequest} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}
