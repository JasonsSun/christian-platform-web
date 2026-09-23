'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { scrollBehavior } from '@/lib/motion';

interface ChatUser {
  id: string;
  displayName: string;
  username?: string;
  avatarColor: string;
}
interface ChatMsg {
  id: string;
  content: string;
  createdAt: string;
  user: ChatUser;
}

function MsgAvatar({ user, size = 32 }: { user: ChatUser; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      data-user-id={user.id}
      style={{ backgroundColor: user.avatarColor || '#3d52d9', width: size, height: size, fontSize: size * 0.4 }}
    >
      {(user.displayName || user.username || '?').slice(0, 1)}
    </span>
  );
}

export default function GroupChat({
  groupId,
  isMember,
  isOwner,
}: {
  groupId: string;
  isMember: boolean;
  isOwner: boolean;
}) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [since, setSince] = useState<string | undefined>(undefined);
  const [wsReady, setWsReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const session = useRef(Math.random().toString(36).slice(2));
  const sendAction = useAction();

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ messages: ChatMsg[]; last?: string }>(`/groups/${groupId}/chat${since ? `?since=${encodeURIComponent(since)}` : ''}`);
      if (r.messages?.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...r.messages.filter((m) => !seen.has(m.id))];
          return merged.slice(-300);
        });
        setSince(r.last || r.messages[r.messages.length - 1]?.createdAt);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [groupId, since]);

  // 初始加载
  useEffect(() => {
    if (isMember) load();
  }, [isMember, load]); // eslint-disable-line

  // WebSocket 实时通道
  useEffect(() => {
    if (!isMember) return;
    let closed = false;
    let hb: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws?room=${encodeURIComponent(`group:${groupId}`)}&s=${session.current}`);
      } catch {
        setWsReady(false);
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setWsReady(true);
        try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch {}
        hb = setInterval(() => {
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
        }
      };
      const teardown = () => {
        if (hb) { clearInterval(hb); hb = null; }
        try { ws.close(); } catch {}
      };
      ws.onerror = () => { setWsReady(false); teardown(); };
      ws.onclose = () => {
        setWsReady(false);
        teardown();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (hb) clearInterval(hb);
      if (retry) clearTimeout(retry);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [isMember, groupId]);

  // 降级：WS 不可用时轮询
  useEffect(() => {
    if (!isMember || wsReady) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [isMember, wsReady, load]);

  // 只滚聊天框自己：以前是对框尾的哨兵调 scrollIntoView，那个方法会连带滚动所有可滚祖先，
  // 而群聊卡片在团契详情页下方 —— 消息一到，整页就被无声滚下去 900 多像素
  // （实测页头 h1 从 top=188 滑到 -725）。
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: scrollBehavior() });
  }, [messages]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sendAction.pending) return;
    const res = await sendAction.run(() => apiPost<{ message: ChatMsg }>(`/groups/${groupId}/chat`, { content }));
    if (res) {
      setDraft('');
      // 自己发的也会经 WS 回声回来，按 id 去重；这里乐观补一条以防 WS 未就绪
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message].slice(-300)
      );
      setSince(res.message.createdAt);
    }
  }, [draft, sendAction, groupId]);

  const remove = useCallback(async (msgId: string) => {
    try {
      await apiDelete(`/groups/${groupId}/chat/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch { /* ignore */ }
  }, [groupId]);

  if (!isMember) {
    return (
      <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100">
        <h2 className="font-display text-xl font-bold text-ink-900 mb-3">群聊</h2>
        <p className="text-sm text-ink-400">加入团契后即可参与群聊</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 md:p-6 shadow-soft border border-ink-100 flex flex-col h-[520px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl font-bold text-ink-900">群聊</h2>
        <span className="text-xs text-ink-400">
          {wsReady ? '实时已连接' : loaded ? '轮询模式' : '连接中…'}
        </span>
      </div>
      <div ref={boxRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <p className="text-center py-8 text-ink-400 text-sm">还没有聊天记录，来打个招呼吧～</p>
        )}
        {messages.map((m) => {
          const mine = currentUserId && m.user.id === currentUserId;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <MsgAvatar user={m.user} size={30} />
              <div className={`max-w-[78%] ${mine ? 'items-end' : ''}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-ink-500">{m.user.displayName}</span>
                  <span className="text-[10px] text-ink-500">{timeAgo(m.createdAt)}</span>
                  {(mine || isOwner) && (
                    <button
                      onClick={() => remove(m.id)}
                      className="text-[10px] text-ink-500 hover:text-rose-600 transition"
                      title="删除"
                    >
                      删除
                    </button>
                  )}
                </div>
                <div
                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    mine ? 'bg-primary-600 text-white rounded-tr-sm' : 'bg-ink-50 text-ink-800 rounded-tl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          aria-label="群聊消息"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="说点什么…"
          className="input-styled flex-1"
          maxLength={1000}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={sendAction.pending} className="btn-primary px-5 flex-shrink-0">
          发送
        </button>
      </div>
    </div>
  );
}
