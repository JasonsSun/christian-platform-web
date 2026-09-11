'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { MessageItem } from '@/lib/types';

interface Thread {
  peer: { id: string; username: string; displayName: string; avatarColor: string; city?: string };
  items: MessageItem[];
}

function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function MessageThreadPage() {
  const params = useParams<{ peerId: string }>();
  const peerId = params.peerId;
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Thread>(user ? `/messages/${peerId}` : null, [user?.id, peerId]);
  const { run, pending, error: sendError } = useAction();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 进入即标记已读（GET 接口已自动置已读），并每 5 秒轮询
  useEffect(() => {
    if (!user) return;
    reload();
    const t = setInterval(() => reload(), 5000);
    return () => clearInterval(t);
  }, [user, peerId, reload]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [data?.items?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    const res = await run(() => apiPost<MessageItem>(`/messages/${peerId}`, { body }));
    if (res) reload();
  }

  if (!user) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-ink-400">请先登录</div>;
  }

  if (loading && !data) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <p className="text-rose-600 mb-3">{error}</p>
        <button onClick={reload} className="btn-secondary">重试</button>
      </div>
    );
  }

  const peer = data?.peer;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col h-[calc(100vh-14rem)]">
      {peer && (
        <div className="flex items-center gap-3 pb-4 border-b border-ink-200">
          <Link href="/messages" className="text-ink-400 hover:text-ink-600">←</Link>
          <Avatar name={peer.displayName} color={peer.avatarColor} size={40} />
          <div>
            <h2 className="font-semibold text-ink-900">{peer.displayName}</h2>
            {peer.city && <p className="text-xs text-ink-500">{peer.city}</p>}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {data?.items?.length === 0 && <p className="text-center text-ink-400 text-sm">还没有消息，发送第一条吧</p>}
        {data?.items?.map((m) => {
          const mine = m.fromId === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                mine ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-br-md' : 'bg-white border border-ink-100 text-ink-800 rounded-bl-md'
              }`}>
                {m.body}
                <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-ink-400'}`}>{formatDateTime(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        {sendError && <p className="text-center text-rose-500 text-sm">{sendError}</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 pt-3 border-t border-ink-200">
        <input
          className="input-styled flex-1"
          placeholder="输入消息…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary px-5 disabled:opacity-60">
          发送
        </button>
      </form>
    </div>
  );
}
