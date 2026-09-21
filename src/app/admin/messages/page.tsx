'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { scrollBehavior } from '@/lib/motion';
import { AdminLayout, SectionTitle, Loading, ErrorBox, Empty, PageHead } from '../_components';
import { StaffBadges } from '@/components/ModeratorBadge';

/**
 * 管理层私信。
 * 入口只在管理后台，接口要求 admin/moderator 角色，
 * 因此普通成员既看不到入口也拿不到数据。
 */

interface Peer {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  role: string;
  scopes: string[];
}

interface Conv {
  peer: Peer;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

interface Msg {
  id: string;
  body: string;
  read: boolean;
  createdAt: string;
  fromId: string;
  toId: string;
}

interface Thread {
  peer: Peer;
  items: Msg[];
}

interface Inbox {
  items: Conv[];
  staff: Peer[];
}

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Inbox>('/admin/messages', []);
  const [peerId, setPeerId] = useState<string>('');
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const convs = data?.items || [];
  const staff = data?.staff || [];

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingThread(true);
    setThreadError(null);
    try {
      const t = await apiGet<Thread>(`/admin/messages/${id}`);
      setThread(t);
    } catch (e: any) {
      setThread(null);
      setThreadError(e?.message || '会话加载失败');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (peerId) load(peerId);
    else {
      setThread(null);
      setThreadError(null);
    }
  }, [peerId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: scrollBehavior() });
  }, [thread?.items?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || !peerId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await apiPost(`/admin/messages/${peerId}`, { body });
      setText('');
      await load(peerId);
      await reload();
    } catch (e: any) {
      setSendError(e?.message || '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  // 未开过会话的管理成员，放在「发起会话」里
  const convIds = new Set(convs.map((c) => c.peer.id));
  const others = staff.filter((s) => !convIds.has(s.id));

  const activePeer =
    thread?.peer ?? convs.find((c) => c.peer.id === peerId)?.peer ?? staff.find((s) => s.id === peerId) ?? null;

  const Avatar = ({ p }: { p: Peer }) => (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
      style={{ backgroundColor: p.avatarColor || '#3d52d9' }}
    >
      {(p.displayName || '?').slice(0, 1)}
    </div>
  );

  return (
    <AdminLayout>
      <PageHead
        eyebrow="协作 · 消息"
        title="管理消息"
        sub="管理员与审核员之间的内部沟通渠道。普通成员既不显示入口，也无法访问此接口。"
      />

      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft grid md:grid-cols-[260px_1fr] min-h-[520px]">
          {/* 会话列表 */}
          <div className="border-r border-ink-100 max-h-[600px] overflow-y-auto">
            <div className="px-4 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider">会话</div>
            {convs.length === 0 ? (
              <div className="px-4 pb-3 text-sm text-ink-400">暂无会话</div>
            ) : (
              convs.map((c) => (
                <button
                  key={c.peer.id}
                  onClick={() => setPeerId(c.peer.id)}
                  className={`w-full text-left px-4 py-3 flex gap-3 items-start transition ${
                    peerId === c.peer.id ? 'bg-primary-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <Avatar p={c.peer} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-ink-800 truncate">{c.peer.displayName}</span>
                      {c.unread > 0 ? (
                        <span className="ml-auto text-[10px] rounded-full bg-rose-600 text-white px-1.5 py-0.5">
                          {c.unread}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <StaffBadges role={c.peer.role} scopes={c.peer.scopes} compact max={2} />
                    </div>
                    <div className="text-xs text-ink-400 truncate mt-1">{c.lastMessage}</div>
                  </div>
                </button>
              ))
            )}

            {others.length ? (
              <>
                <div className="px-4 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider border-t border-ink-100">
                  发起会话
                </div>
                {others.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPeerId(s.id)}
                    className={`w-full text-left px-4 py-2.5 flex gap-3 items-center transition ${
                      peerId === s.id ? 'bg-primary-50' : 'hover:bg-ink-50'
                    }`}
                  >
                    <Avatar p={s} />
                    <div className="min-w-0">
                      <div className="text-sm text-ink-700 truncate">{s.displayName}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <StaffBadges role={s.role} scopes={s.scopes} compact max={2} />
                      </div>
                    </div>
                  </button>
                ))}
              </>
            ) : null}
          </div>

          {/* 会话内容 */}
          <div className="flex flex-col min-h-[520px]">
            {!peerId ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <Empty label="从左侧选择一位管理员或审核员开始沟通" />
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-2">
                  {/* 对方信息左侧列表里就有，不必等会话接口返回 —— 否则拉取失败时这里会一直挂着「加载中…」 */}
                  {activePeer ? (
                    <>
                      <span className="font-medium text-ink-800">{activePeer.displayName}</span>
                      <StaffBadges role={activePeer.role} scopes={activePeer.scopes} compact />
                    </>
                  ) : (
                    <span className="text-sm text-ink-400">加载中…</span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[420px]">
                  {loadingThread && !thread ? <Loading /> : null}
                  {!loadingThread && threadError && (
                    <div className="text-center py-10">
                      <p className="text-sm text-rose-600 mb-3">{threadError}</p>
                      <button className="btn-secondary btn-sm text-sm px-4" onClick={() => load(peerId)}>
                        重试
                      </button>
                    </div>
                  )}
                  {(thread?.items || []).map((m) => {
                    const mine = m.fromId === user?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                            mine ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-800'
                          }`}
                        >
                          {m.body}
                          <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-ink-400'}`}>
                            {new Date(m.createdAt).toLocaleString('zh-CN', { hour12: false })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-ink-100 p-3 flex gap-2">
                  <input
                    className="input-styled flex-1 text-sm"
                    aria-label="输入消息"
                    placeholder="输入消息…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  />
                  <button className="btn-primary text-sm" onClick={send} disabled={!text.trim() || sending}>
                    {sending ? '发送中…' : '发送'}
                  </button>
                </div>
                {sendError && (
                  <p role="alert" className="px-3 pb-3 -mt-1 text-xs text-rose-600">{sendError}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
