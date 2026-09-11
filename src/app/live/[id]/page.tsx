'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useConfirmNav } from '@/lib/confirm';
import { apiGet, apiPost, qs } from '@/lib/api';
import { HlsPlayer } from '@/components/HlsPlayer';
import { Danmaku } from '@/components/Danmaku';
import { LiveGuide } from '@/components/LiveGuide';
import { Loading, ErrorBox } from '@/components/ui';
import ShareButton from '@/components/ShareButton';

interface ChatMsg { id: string; roomId: string; userId: string | null; displayName: string; avatarColor: string | null; content: string; createdAt: string; }
interface LiveRoom {
  id: string; title: string; description: string | null; coverUrl: string | null;
  status: 'created' | 'live' | 'ended'; startedAt: string | null; endedAt: string | null; viewerPeak: number;
  recordEnabled?: boolean; recordingMediaId?: string | null;
  owner?: { id: string; displayName: string; avatarColor: string | null };
  viewerCount: number; messages: ChatMsg[]; live: boolean; hlsUrl?: string;
  streamKey?: string; publishSecret?: string; rtmpUrl?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  reviewVideoId?: string | null;
  scheduledAt?: string | null;
  cancelled?: boolean;
  cancelReason?: string | null;
  expired?: boolean;
}

export default function LiveWatchPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const notice = useNotice();
  const confirmNav = useConfirmNav();
  const id = params.id;
  const { data, loading, error, reload } = useApi<{ [k: string]: any; id: string } & LiveRoom>(`/live/${id}`, [id]);
  const { run, pending } = useAction();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [since, setSince] = useState<string | undefined>(undefined);
  const [viewerCount, setViewerCount] = useState(0);
  const [copied, setCopied] = useState('');
  const [danmakuOn, setDanmakuOn] = useState(false);     // 弹幕开关(默认关闭)
  const [danmakuOpacity, setDanmakuOpacity] = useState(1); // 弹幕透明度(默认不透明)
  const [hovering, setHovering] = useState(false);       // 鼠标是否悬停在视频区(用于暂停滚动)
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);

  const DANMAKU_ON_KEY = 'live-danmaku-on';
  const DANMAKU_OP_KEY = 'live-danmaku-opacity';

  // 从 localStorage 读取用户上次的选择(默认关闭,教会直播场景不打扰)
  useEffect(() => {
    try {
      setDanmakuOn(localStorage.getItem(DANMAKU_ON_KEY) === '1');
      const op = Number(localStorage.getItem(DANMAKU_OP_KEY));
      if (!Number.isNaN(op) && op >= 0 && op <= 1) setDanmakuOpacity(op);
    } catch { /* ignore */ }
  }, []);

  function toggleDanmaku() {
    setDanmakuOn((v) => {
      const nv = !v;
      try { localStorage.setItem(DANMAKU_ON_KEY, nv ? '1' : '0'); } catch { /* ignore */ }
      return nv;
    });
  }
  function changeOpacity(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setDanmakuOpacity(v);
    try { localStorage.setItem(DANMAKU_OP_KEY, String(v)); } catch { /* ignore */ }
  }

  const room = data as LiveRoom | undefined;
  const isStaff = !!user && (user.role === 'admin' || user.role === 'moderator');
  const isStaffOrOwner = !!user && !!room && (isStaff || user.id === room.owner?.id);

  // 开播拦截原因(审核/取消/过期)
  const startBlock = room
    ? room.cancelled
      ? (room.cancelReason ? `该直播间已被取消:${room.cancelReason}` : '该直播间已被取消')
      : room.expired
        ? '已过约定开播时间,该直播间已过期,无法开播'
        : room.reviewStatus === 'pending'
          ? '直播间审核中,请等待管理员通过后再开播'
          : room.reviewStatus === 'rejected'
            ? (room.reviewNote ? `直播间未通过审核:${room.reviewNote}` : '直播间未通过审核,无法开播')
            : null
    : null;

  const session = useRef(Math.random().toString(36).slice(2));

  // 拉取聊天(轮询)
  const loadChat = useCallback(async () => {
    try {
      const r = await apiGet<{ messages: ChatMsg[]; viewerCount?: number }>(`/live/${id}/chat${since ? `?since=${encodeURIComponent(since)}` : ''}`);
      if (typeof r.viewerCount === 'number') setViewerCount(r.viewerCount);
      if (r.messages?.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...r.messages.filter((m) => !seen.has(m.id))];
          return merged.slice(-300);
        });
        setSince(r.messages[r.messages.length - 1].createdAt);
      }
    } catch { /* ignore */ }
  }, [id, since]);

  useEffect(() => {
    if (room?.messages?.length) { setMessages(room.messages); setSince(room.messages[room.messages.length - 1]?.createdAt); }
  }, [room?.id]); // eslint-disable-line

  const live = !!room && room.status !== 'ended' && !room.cancelled;

  // WebSocket 实时通道:聊天消息与在线人数推送,替代高频轮询。
  // 连接失败/服务端未启用 WS 时自动降级到 REST 轮询(见下方 fallback)。
  useEffect(() => {
    if (!live) return;
    let closed = false;
    let hbTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(
          `${proto}//${window.location.host}/ws?room=${encodeURIComponent(String(id))}&s=${session.current}`
        );
      } catch {
        setWsReady(false);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setWsReady(true);
        try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch {}
        hbTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch {}
          }
        }, 15000);
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg?.type === 'chat' && msg.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.message.id) ? prev : [...prev, msg.message].slice(-300)
          );
        } else if (msg?.type === 'viewer_count' && typeof msg.count === 'number') {
          setViewerCount(msg.count);
        }
      };

      const teardown = () => {
        if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
        try { ws.close(); } catch {}
      };

      ws.onerror = () => { setWsReady(false); teardown(); };
      ws.onclose = () => {
        setWsReady(false);
        teardown();
        // 断线重连(指数退避上限 15s)
        if (!closed) retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (hbTimer) clearInterval(hbTimer);
      if (retryTimer) clearTimeout(retryTimer);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [live, id]);

  // 降级:WS 不可用时(未启用 / 断线 / 代理不支持)退回 REST 轮询
  useEffect(() => {
    if (!live || wsReady) return;
    loadChat();
    const t = setInterval(loadChat, 5000);
    return () => clearInterval(t);
  }, [live, wsReady, loadChat]);

  // 降级:仅登记在线状态(在线人数由聊天接口附带,不额外发请求)
  useEffect(() => {
    if (!live || wsReady) return;
    const beat = async () => {
      try {
        const r = await apiPost<{ viewerCount: number }>(`/live/${id}/heartbeat?s=${session.current}`);
        if (r?.viewerCount != null) setViewerCount(r.viewerCount);
      } catch { /* ignore */ }
    };
    beat();
    const t = setInterval(beat, 20000);
    return () => clearInterval(t);
  }, [live, wsReady, id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMsg() {
    const c = draft.trim();
    if (!c) return;
    const r = await run(() => apiPost<{ message: ChatMsg }>(`/live/${id}/chat`, { content: c }));
    if (r) {
      setDraft('');
      // 乐观更新:立即把刚发出的消息并入聊天流(弹幕开启时会即时上屏)
      if (r.message) {
        setMessages((prev) => prev.some((m) => m.id === r.message.id) ? prev : [...prev, r.message].slice(-300));
      }
      await loadChat();
    }
  }

  async function startLive() {
    const r = await run(() => apiPost(`/live/${id}/start`));
    if (r) { notice.success('已开始直播'); reload(); }
    else notice.error('开播失败,请查看提示');
  }
  async function endLive() {
    confirmNav({
      title: '结束本场直播',
      desc: `结束后观众将无法继续观看「${room?.title || '本场直播'}」,且不可恢复。`,
      danger: true,
      confirmText: '确认结束直播',
      cancelText: '继续直播',
      back: `/live/${id}`,
      action: 'live.end',
      params: { roomId: id },
      onConfirm: async () => {
        await apiPost(`/live/${id}/end`);
        notice.success('本场直播已结束');
      },
    });
  }

  function cancelRoom(force: boolean) {
    if (!room) return;
    confirmNav({
      title: force ? '强制关闭并取消直播' : '取消本场直播',
      desc: force
        ? `将立即结束「${room.title}」并标记取消,观众看到「已取消」。用于直播内容违规等紧急情况。`
        : `取消后「${room.title}」将不再对外展示,数据保留。如需再播请新建一场。`,
      danger: true,
      confirmText: force ? '强制关闭' : '确认取消',
      cancelText: '再想想',
      input: { label: '取消原因(可选)', required: false },
      back: `/live/${id}`,
      onConfirm: async (reason) => {
        const r = await run(() => apiPost(`/live/${id}/cancel`, {
          reason: reason?.trim() || (force ? '管理员强制关闭' : undefined),
        }));
        if (r) {
          notice.success(force ? '已强制关闭并取消本场直播' : '已取消本场直播');
          reload();
        }
      },
    });
  }

  function copy(text: string, tag: string) {
    navigator.clipboard?.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500);
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!room) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">直播间不存在</div>;

  const badge = room.cancelled
    ? { text: '已取消', cls: 'bg-ink-400 text-white' }
    : room.expired
      ? { text: '已过期', cls: 'bg-ink-500 text-white' }
      : room.reviewStatus === 'rejected'
        ? { text: '未通过审核', cls: 'bg-rose-500 text-white' }
        : room.reviewStatus === 'pending'
          ? { text: '待审核', cls: 'bg-amber-400 text-white' }
          : room.live
            ? { text: '● LIVE', cls: 'bg-rose-500 text-white' }
            : room.status === 'ended'
              ? { text: '已结束', cls: 'bg-ink-300 text-white' }
              : { text: '预告', cls: 'bg-ink-700/80 text-white/90' };

  const isOwner = !!user && user.id === room.owner?.id;
  const ownerCancelable = isOwner && room.status === 'created' && !room.cancelled && !room.expired;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/live" className="text-sm text-ink-400 hover:text-ink-700">← 返回直播列表</Link>

      <div className="grid lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 space-y-4">
          {/* 视频区:叠加弹幕层与右上角弹幕控制 */}
          <div
            className="relative"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <HlsPlayer src={room.live ? room.hlsUrl || null : null} poster={room.coverUrl} live={room.status === 'live'} />

            {/* 弹幕覆盖层:绝对定位于视频之上,pointer-events-none 不挡播放器控制条 */}
            <Danmaku
              messages={messages}
              selfId={user?.id ?? null}
              active={danmakuOn}
              opacity={danmakuOpacity}
              paused={hovering && danmakuOn}
            />

            {/* 弹幕控制(右上角,可点击,pointer-events-auto 不挡播放器) */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 pointer-events-auto">
              {danmakuOn && (
                <input
                  type="range" min={0.2} max={1} step={0.1} value={danmakuOpacity}
                  onChange={changeOpacity}
                  className="w-16 sm:w-24 accent-amber-400"
                  aria-label="弹幕透明度"
                  title="弹幕透明度"
                />
              )}
              <button
                type="button"
                onClick={toggleDanmaku}
                className={`text-xs px-2 py-1 rounded-full backdrop-blur-sm transition-colors ${danmakuOn ? 'bg-amber-400 text-white' : 'bg-black/50 text-white/90'}`}
              >
                {danmakuOn ? '弹幕开' : '弹幕关'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="font-display text-xl font-bold text-ink-900">{room.title}</h1>
              <p className="text-xs text-ink-400 mt-1">
                主播 {room.owner?.displayName || '—'} · 峰值 {room.viewerPeak} 人
                {room.scheduledAt ? ` · 约定 ${new Date(room.scheduledAt).toLocaleString('zh-CN')}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
              {room.status === 'live' && (
                <span className="text-xs text-ink-500">👁 {Math.max(viewerCount, room.viewerCount)}</span>
              )}
              <ShareButton
                title={`直播 · ${room.title}`}
                text={`推荐你来看圣约社区直播「${room.title}」，一起在线团契。`}
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              />
            </div>
          </div>

          {/* 状态横幅:取消/过期/审核中/驳回 */}
          {room.cancelled ? (
            <div className="rounded-xl px-4 py-3 bg-ink-100/80 border border-ink-200 text-sm text-ink-600">
              该直播间已取消{room.cancelReason ? `:「${room.cancelReason}」` : ''}。数据保留,不再对外展示。
            </div>
          ) : null}
          {room.expired && !room.cancelled ? (
            <div className="rounded-xl px-4 py-3 bg-ink-100/80 border border-ink-200 text-sm text-ink-600">
              已过约定开播时间,该直播间已过期,无法再开播。如需直播请新建一场。
            </div>
          ) : null}
          {room.reviewStatus === 'pending' && !room.cancelled ? (
            <div className="rounded-xl px-4 py-3 bg-amber-50/80 border border-amber-200 text-sm text-amber-700">
              ⏳ 直播间审核中{(isOwner || isStaff) ? '' : ',通过前暂不对外展示'},通过后即可开播。
            </div>
          ) : null}
          {room.reviewStatus === 'rejected' && !room.cancelled ? (
            <div className="rounded-xl px-4 py-3 bg-rose-50/80 border border-rose-200 text-sm text-rose-700">
              ✕ 审核未通过{room.reviewNote ? `:${room.reviewNote}` : ''}。
              {isStaff && <Link href="/admin/live" className="ml-2 underline">去管理后台处理</Link>}
            </div>
          ) : null}

          {room.description && <p className="text-sm text-ink-600 whitespace-pre-wrap">{room.description}</p>}

          {/* 主播/管理员控制台 */}
          {isStaffOrOwner && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {room.live && (
                  <span className="text-sm text-ink-700 font-medium">🔗 直播间链接</span>
                )}
                {room.status !== 'ended' && !room.cancelled && (
                  room.live
                    ? <button className="btn-danger" disabled={pending} onClick={endLive}>结束直播</button>
                    : <button className="btn-primary" disabled={pending || !!startBlock} onClick={startLive}>开始直播</button>
                )}
                {startBlock && room.status !== 'ended' && !room.cancelled && (
                  <p className="text-xs text-rose-600 w-full">⚠ {startBlock}</p>
                )}
                {room.reviewStatus === 'pending' && room.reviewVideoId && (
                  <div className="w-full text-sm space-y-2 border-t border-ink-100 pt-3">
                    <p className="text-ink-500">已提交现场视频审核材料:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-ink-900 text-emerald-200 text-xs px-3 py-2 rounded-lg overflow-x-auto">media/{room.reviewVideoId}</code>
                      <Link href={`/media/${room.reviewVideoId}`} target="_blank" className="btn-ghost">查看视频</Link>
                    </div>
                    <p className="text-xs text-amber-600">审核通过后系统会发通知，点通知回到本页即可开播。</p>
                  </div>
                )}
                {room.status === 'ended' && <span className="text-sm text-ink-400">本场已结束</span>}
                {ownerCancelable && (
                  <button className="btn-ghost text-rose-600" disabled={pending} onClick={() => cancelRoom(false)}>取消本场直播</button>
                )}
                {isStaff && room.status === 'live' && (
                  <button className="btn-danger" disabled={pending} onClick={() => cancelRoom(true)}>强制关闭</button>
                )}
                {room.recordEnabled && room.status === 'ended' && (
                  room.recordingMediaId
                    ? <Link href={`/media/${room.recordingMediaId}`} className="btn-secondary text-sm">📼 查看录像</Link>
                    : <span className="text-xs text-amber-600">⏳ 录像生成中,稍后刷新本页…</span>
                )}
                {room.recordEnabled && room.status !== 'ended' && (
                  <span className="text-xs text-ink-400">本场已开启保存录像,结束后自动入库审核</span>
                )}
                {isStaff && !isOwner && (
                  <Link href="/admin/live" className="text-xs text-ink-400 hover:text-ink-600 ml-auto">批量管理 →</Link>
                )}
              </div>

              {room.status !== 'ended' && !room.cancelled && !startBlock && room.rtmpUrl && (
                <div className="text-sm space-y-2">
                  <p className="text-ink-500">在 OBS / 手机推流软件中填入以下信息即可开播:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-ink-900 text-emerald-200 text-xs px-3 py-2 rounded-lg overflow-x-auto">服务器: rtmp://{location.hostname}:1935</code>
                    <button className="btn-ghost" onClick={() => copy(`rtmp://${location.hostname}:1935`, 'srv')}>{copied === 'srv' ? '已复制' : '复制'}</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-ink-900 text-emerald-200 text-xs px-3 py-2 rounded-lg overflow-x-auto">串流密钥: {room.streamKey}</code>
                    <button className="btn-ghost" onClick={() => copy(room.streamKey!, 'key')}>{copied === 'key' ? '已复制' : '复制'}</button>
                  </div>
                  <p className="text-xs text-ink-400">
                    也可直接把完整地址 <code className="text-emerald-200">{room.rtmpUrl}</code> 作为服务器填入(串流密钥留空)。
                    直播地址随机生成,他人无法猜到。
                  </p>
                </div>
              )}

              {/* 开播后:展示直播间链接,方便主播分享给会友 */}
              {room.live && (
                <div className="text-sm space-y-2 border-t border-ink-100 pt-3">
                  <p className="text-ink-500">本场正在直播,把下面的链接发给会友即可观看:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-ink-900 text-sky-200 text-xs px-3 py-2 rounded-lg overflow-x-auto">
                      {typeof window !== 'undefined' ? `${window.location.origin}/live/${room.id}` : `/live/${room.id}`}
                    </code>
                    <button className="btn-ghost" onClick={() => copy(`${window.location.origin}/live/${room.id}`, 'roomlink')}>
                      {copied === 'roomlink' ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              )}

              {/* 开播指南:仅未开播时展示,主播对照步骤开播 */}
              {!room.live && <LiveGuide defaultOpen />}
            </div>
          )}
        </div>

        {/* 聊天室 */}
        <div className="glass rounded-2xl flex flex-col h-[70vh]">
          <div className="px-4 py-3 border-b border-ink-100 font-semibold text-ink-900">直播聊天</div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {room.cancelled ? (
              <p className="text-sm text-ink-400">该直播间已取消,聊天已关闭。</p>
            ) : messages.length === 0 ? <p className="text-sm text-ink-400">还没有人发言,来抢沙发~</p> : null}
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-semibold text-ink-700" style={{ color: m.avatarColor || undefined }}>{m.displayName}</span>
                <span className="text-ink-600 ml-1 break-words">{m.content}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {!room.cancelled && (
            <div className="p-3 border-t border-ink-100 flex items-center gap-2">
              <input
                className="input-styled flex-1"
                placeholder={user ? '说点什么…' : '登录后参与聊天'}
                value={draft}
                disabled={!user}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }}
              />
              <button className="btn-primary" disabled={!user || pending || !draft.trim()} onClick={sendMsg}>发送</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
