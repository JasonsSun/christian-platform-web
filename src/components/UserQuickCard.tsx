'use client';

/**
 * 点头像就地弹出的人名片。
 *
 * 为什么要有它：加好友 / 关注此前只能在 /friends 和 /users/[id] 两处做，
 * 而社区、同城、团契、评论里到处都在展示头像——想加一个人得先跳个人页再跳回来。
 * 这里用一次事件委托接管全站头像，页面不必为此改结构：只要头像元素带上
 * `data-user-id`，点它就出卡片。
 *
 * 三条硬性约束（都踩过坑，别改）：
 * 1. 必须走 Portal 挂到 body —— .glass 带 backdrop-filter，fixed 在它会以祖先为参照系；
 * 2. 根节点必须带 data-guard —— 否则 components/Guards.tsx 的清扫会把它当广告弹窗删掉；
 * 3. 监听必须是 document 上的捕获阶段 —— Next 的 Link 把 click 交给 React 根容器（body 的
 *    后代），冒泡阶段再 preventDefault 已经晚了，跳转会照常发生。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Portal from '@/components/Portal';
import { api, apiDelete, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { useDialogFocus, useEscape } from '@/lib/a11y';
import { formatDate } from '@/lib/format';
import type { FriendStatus } from '@/lib/types';
import {
  IconArrowRight,
  IconBan,
  IconClose,
  IconHandshake,
  IconUser,
} from '@/components/icons';

interface Profile {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarColor: string;
  avatarUrl: string;
  bio: string;
  city: string;
  church: string;
  createdAt: string;
  following: boolean;
  blocked: boolean;
  friendStatus: FriendStatus;
  isMe: boolean;
  stats: { contents: number; followers: number; following: number; activities: number };
}

/** 卡片里改动了关注/好友关系后广播，让列表页的行内按钮一起对齐，不必刷新 */
export const USER_CARD_CHANGED = 'user-card:changed';

export interface UserCardChange {
  id: string;
  following: boolean;
  friendStatus: FriendStatus;
  followers: number;
}

/** 列表页订阅：回调走 ref，避免每次渲染重挂监听 */
export function useUserCardChanges(onChange: (change: UserCardChange) => void) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    const listener = (e: Event) => handler.current((e as CustomEvent<UserCardChange>).detail);
    window.addEventListener(USER_CARD_CHANGED, listener);
    return () => window.removeEventListener(USER_CARD_CHANGED, listener);
  }, []);
}

const CARD_W = 320;
const PAD = 12;
const GAP = 8;

export default function UserQuickCard() {
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();
  const pathname = usePathname();

  const [targetId, setTargetId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState<'' | 'follow' | 'friend' | 'block'>('');
  const [pos, setPos] = useState({ top: -9999, left: -9999, width: CARD_W });

  const anchorRef = useRef<HTMLElement | null>(null);
  const open = targetId !== null;
  const cardRef = useDialogFocus<HTMLDivElement>(open, { trap: false });

  const close = useCallback(() => {
    anchorRef.current = null;
    setTargetId(null);
  }, []);

  /** 卡片贴着触发头像摆放：默认在下沿，放不下就翻到上沿，再夹进视口 */
  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !el.isConnected) {
      close();
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = Math.min(CARD_W, vw - PAD * 2);
    const height = cardRef.current?.offsetHeight || 0;
    let top = r.bottom + GAP;
    if (height && top + height > vh - PAD && r.top - GAP - height >= PAD) top = r.top - GAP - height;
    // 卡片还没量到高度时先按估高夹住，避免首帧把内容顶出视口
    top = Math.max(PAD, Math.min(top, vh - PAD - (height || 220)));
    const left = Math.max(PAD, Math.min(r.left + r.width / 2 - width / 2, vw - PAD - width));
    setPos({ top, left, width });
  }, [cardRef, close]);

  // ---------- 全站委托：接管带 data-user-id 的头像 ----------
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-user-id]') as HTMLElement | null;
      const id = el?.dataset.userId;
      if (!el || !id) return;
      // 自己的头像不接管：卡片摆在自己脸上没意义，点进资料页才是想要的
      if (id === user?.id) return;
      // 同一个人再点一次 = 收起
      if (id === anchorRef.current?.dataset?.userId) {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      anchorRef.current = el;
      setProfile(null);
      setLoadErr('');
      setBusy('');
      setTargetId(id);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [close, user?.id]);

  // 打开后跟随滚动/缩放重新定位：卡片是 fixed，锚点在文档流里
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place();
      });
    };
    place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  // 卡片自身高度会变（骨架 → 真实资料），而「放下沿还是翻上沿」是按高度定的
  useEffect(() => {
    if (open) place();
  }, [open, profile, loadErr, place]);

  // 卡片内的链接跳了页：锚点已经没了，直接收起
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEscape(open, close);

  useEffect(() => {
    if (!targetId) return;
    let alive = true;
    // 一律 noCache：8 秒的 GET 缓存会把刚改完的关注/好友状态盖回旧值
    api<Profile>(`/users/${targetId}`, {}, { noCache: true })
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch((e: any) => {
        if (alive) setLoadErr(e?.message || '加载失败');
      });
    return () => {
      alive = false;
    };
  }, [targetId]);

  const emit = useCallback((next: Profile) => {
    window.dispatchEvent(
      new CustomEvent<UserCardChange>(USER_CARD_CHANGED, {
        detail: {
          id: next.id,
          following: next.following,
          friendStatus: next.friendStatus,
          followers: next.stats.followers,
        },
      })
    );
  }, []);

  async function toggleFollow(p: Profile) {
    setBusy('follow');
    try {
      const res = p.following
        ? await apiDelete<{ following: boolean; followers: number }>(`/users/${p.id}/follow`)
        : await apiPost<{ following: boolean; followers: number }>(`/users/${p.id}/follow`);
      const next: Profile = {
        ...p,
        following: res.following,
        stats: { ...p.stats, followers: res.followers },
      };
      setProfile(next);
      emit(next);
      notice.success(res.following ? `已关注 ${p.displayName}` : `已取消关注 ${p.displayName}`);
    } catch (e: any) {
      notice.error(e?.message || '操作失败');
    } finally {
      setBusy('');
    }
  }

  async function addFriend(p: Profile) {
    setBusy('friend');
    try {
      await apiPost('/friends/request', { addresseeId: p.id });
      const next: Profile = { ...p, friendStatus: 'pending_sent' };
      setProfile(next);
      emit(next);
      notice.success(`已向 ${p.displayName} 发送好友申请`);
    } catch (e: any) {
      const msg = e?.message || '操作失败';
      // 409 是「你们已经是好友 / 申请还在路上」，属状态不是故障：拉一次真实状态对齐
      if (e?.status === 409) {
        notice.info(msg);
        try {
          const fresh = await api<Profile>(`/users/${p.id}`, {}, { noCache: true });
          setProfile(fresh);
          emit(fresh);
        } catch {
          /* 状态拉不到就算了，按钮保持原样 */
        }
      } else {
        notice.error(msg);
      }
    } finally {
      setBusy('');
    }
  }

  async function unblock(p: Profile) {
    setBusy('block');
    try {
      await apiDelete(`/users/${p.id}/block`);
      setProfile({ ...p, blocked: false });
      notice.success(`已取消屏蔽 ${p.displayName}`);
    } catch (e: any) {
      notice.error(e?.message || '操作失败');
    } finally {
      setBusy('');
    }
  }

  /** 未登录时的统一出口：不拦着人看资料，只在真要发起关系时引导登录 */
  function needLogin() {
    notice.info('请先登录');
    goLogin();
  }

  return (
    <Portal>
      {open && (
        <div
          ref={cardRef}
          data-guard="user-quick-card"
          role="dialog"
          aria-label={`${profile?.displayName || '用户'}的资料卡片`}
          className="fixed z-[80] bg-white rounded-2xl border border-ink-100 shadow-pop overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, animation: 'notice-in .18s ease-out' }}
        >
          <div className="flex items-start gap-3 p-4 pb-3">
            <span className="relative flex-shrink-0">
              <MiniAvatar name={profile?.displayName || '?'} color={profile?.avatarColor} url={profile?.avatarUrl} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-ink-900 truncate">{profile?.displayName || '加载中…'}</p>
                {profile?.role === 'admin' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-100 shrink-0">
                    管理员
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-400 truncate mt-0.5">
                {profile ? `@${profile.username}` : '\u00A0'}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="关闭资料卡"
              className="-mr-1 -mt-1 p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-50 shrink-0"
            >
              <IconClose className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>

          {loadErr ? (
            <p className="px-4 pb-4 text-sm text-rose-600">{loadErr}</p>
          ) : !profile ? (
            <div className="px-4 pb-4 space-y-2" aria-hidden>
              <div className="h-3.5 w-28 rounded bg-ink-100 animate-pulse" />
              <div className="h-3.5 w-40 rounded bg-ink-100 animate-pulse" />
              <div className="h-9 rounded-xl bg-ink-100 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="px-4 space-y-1">
                {(profile.city || profile.church) && (
                  <p className="text-xs text-ink-500 truncate">
                    {[profile.city, profile.church].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-sm text-ink-600 line-clamp-2">
                  {profile.bio || '这位弟兄/姐妹还没有填写简介'}
                </p>
                <p className="text-xs text-ink-400">
                  {profile.stats.contents} 内容 · {profile.stats.followers} 粉丝 · 加入于{' '}
                  {formatDate(profile.createdAt)}
                </p>
              </div>

              <div className="mt-3 p-4 pt-3 bg-ink-50 border-t border-ink-100">
                {profile.isMe ? (
                  <Link href="/me" className="btn-secondary btn-sm w-full text-center">
                    编辑资料
                  </Link>
                ) : profile.blocked ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-ink-500 min-w-0">
                      <IconBan className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                      <span className="truncate">你已屏蔽该用户</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => unblock(profile)}
                      disabled={busy === 'block'}
                      className="btn-secondary btn-sm px-3 ml-auto shrink-0 disabled:opacity-60"
                    >
                      {busy === 'block' ? '处理中…' : '取消屏蔽'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {profile.friendStatus === 'friends' ? (
                      <>
                        <span
                          aria-disabled="true"
                          className="btn-secondary btn-sm px-3 text-center opacity-70 shrink-0"
                        >
                          已加好友
                        </span>
                        <Link href={`/messages/${profile.id}`} className="btn-primary btn-sm px-3 text-center">
                          私信
                        </Link>
                      </>
                    ) : profile.friendStatus === 'pending_sent' ? (
                      <span aria-disabled="true" className="btn-secondary btn-sm px-3 text-center opacity-70">
                        已发送
                      </span>
                    ) : profile.friendStatus === 'pending_received' ? (
                      <Link href="/friends?tab=requests" className="btn-gold btn-sm px-3 text-center">
                        待你确认
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => (user ? addFriend(profile) : needLogin())}
                        disabled={busy === 'friend'}
                        className="btn-primary btn-sm px-3 flex-1 disabled:opacity-60"
                      >
                        <IconHandshake className="w-3.5 h-3.5" strokeWidth={1.8} />
                        {busy === 'friend' ? '发送中…' : '加好友'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => (user ? toggleFollow(profile) : needLogin())}
                      disabled={busy === 'follow'}
                      className={`btn-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 text-sm font-semibold rounded-xl border transition-colors disabled:opacity-60 ${
                        profile.following
                          ? 'bg-white border-ink-200 text-ink-600 hover:text-rose-600 hover:border-rose-200'
                          : 'bg-white border-primary-200 text-primary-700 hover:bg-primary-50'
                      }`}
                    >
                      <IconUser className="w-3.5 h-3.5" strokeWidth={1.8} />
                      {busy === 'follow' ? '处理中…' : profile.following ? '已关注' : '关注'}
                    </button>
                  </div>
                )}

                <Link
                  href={`/users/${profile.id}`}
                  className="mt-2.5 flex items-center justify-center gap-1 text-xs text-ink-500 hover:text-primary-700"
                >
                  查看完整资料
                  <IconArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </Portal>
  );
}

function MiniAvatar({ name, color, url }: { name: string; color?: string; url?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        decoding="async"
        className="w-12 h-12 rounded-full object-cover bg-ink-100"
      />
    );
  }
  return (
    <span
      className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold"
      style={{ background: color || '#3d52d9', fontSize: 18 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
