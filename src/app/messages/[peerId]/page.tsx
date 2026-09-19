'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiPost, apiPatch, apiDelete, apiForm } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { scrollBehavior } from '@/lib/motion';
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
  const [uploading, setUploading] = useState(false);
  const [opError, setOpError] = useState('');
  // 行内二次确认：{ id, kind } —— 不使用 confirm 弹框
  const [confirmOp, setConfirmOp] = useState<{ id: string; kind: 'recall' | 'delete' } | null>(null);
  const [opBusy, setOpBusy] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 进入即标记已读（GET 接口已自动置已读），并每 5 秒轮询
  useEffect(() => {
    if (!user) return;
    reload();
    const t = setInterval(() => reload(), 5000);
    return () => clearInterval(t);
  }, [user, peerId, reload]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: scrollBehavior() });
  }, [data?.items?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    setOpError('');
    const res = await run(() => apiPost<MessageItem>(`/messages/${peerId}`, { body }));
    if (res) reload();
  }

  /** 发图片：先传到媒体库拿到 url，再作为附件发出去 */
  async function sendImage(file: File) {
    setOpError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await apiForm<{ url?: string }>('/media/upload', fd);
      if (!up?.url) throw new Error('上传未返回地址');
      const res = await run(() => apiPost<MessageItem>(`/messages/${peerId}`, { attachment: up.url }));
      if (res) reload();
    } catch (e: any) {
      setOpError(e?.message || '图片发送失败');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function recall(messageId: string) {
    setOpBusy(messageId);
    setOpError('');
    try {
      await apiPatch(`/messages/${peerId}`, { messageId });
      setConfirmOp(null);
      reload();
    } catch (e: any) {
      setOpError(e?.message || '撤回失败');
    } finally {
      setOpBusy('');
    }
  }

  async function remove(messageId: string) {
    setOpBusy(messageId);
    setOpError('');
    try {
      await apiDelete(`/messages/${peerId}?messageId=${encodeURIComponent(messageId)}`);
      setConfirmOp(null);
      reload();
    } catch (e: any) {
      setOpError(e?.message || '删除失败');
    } finally {
      setOpBusy('');
    }
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
          const recalled = !!m.recalledAt;
          const confirming = confirmOp?.id === m.id;

          // 已撤回的消息只剩一条提示，不做撤回/删除操作
          return (
            <div key={m.id} className={`flex group ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[78%] flex flex-col gap-1">
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    mine
                      ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-br-md'
                      : 'bg-white border border-ink-100 text-ink-800 rounded-bl-md'
                  }`}
                >
                  {recalled ? (
                    <span className="italic opacity-70">消息已撤回</span>
                  ) : (
                    <>
                      {m.attachment ? (
                        // 打开原图得是真链接：onClick+window.open 键盘既走不到也看不见网址，
                        // 外面的固定比例盒子顺便挡住图片加载完成时的跳动
                        <a
                          href={m.attachment}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full max-w-[16rem] aspect-[4/3] overflow-hidden rounded-lg bg-ink-100"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.attachment}
                            alt="图片消息"
                            className="h-full w-full object-cover"
                           decoding="async" loading="lazy" />
                        </a>
                      ) : null}
                      {m.body ? <div className={m.attachment ? 'mt-1.5' : ''}>{m.body}</div> : null}
                    </>
                  )}

                  <div className={`text-[10px] mt-1 flex items-center gap-1.5 ${mine ? 'text-white/70' : 'text-ink-400'}`}>
                    <span>{formatDateTime(m.createdAt)}</span>
                    {/* 已读回执：仅自己发出的消息显示 */}
                    {mine && !recalled ? <span>{m.readAt ? '已读' : '未读'}</span> : null}
                  </div>
                </div>

                {/* 悬浮操作：撤回仅限自己在时效内的消息，删除对自己侧隐藏 */}
                {!recalled && (
                  <div className={`flex items-center gap-2 text-[11px] ${mine ? 'justify-end' : 'justify-start'}`}>
                    {confirming ? (
                      <>
                        <span className="text-ink-500">
                          {confirmOp.kind === 'recall' ? '确认撤回？' : '删除后仅你可见范围内消失，确认？'}
                        </span>
                        <button
                          type="button"
                          disabled={opBusy === m.id}
                          onClick={() => (confirmOp.kind === 'recall' ? recall(m.id) : remove(m.id))}
                          className="px-2 py-0.5 rounded-md bg-rose-600 text-white disabled:opacity-60"
                        >
                          {opBusy === m.id ? '处理中…' : '确认'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmOp(null)}
                          className="px-2 py-0.5 rounded-md text-ink-500 hover:bg-ink-100"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <span className="opacity-0 max-md:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-2">
                        {mine && m.canRecall ? (
                          <button
                            type="button"
                            onClick={() => setConfirmOp({ id: m.id, kind: 'recall' })}
                            className="text-ink-500 hover:text-primary-600"
                          >
                            撤回
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setConfirmOp({ id: m.id, kind: 'delete' })}
                          className="text-ink-500 hover:text-rose-600"
                        >
                          删除
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sendError && <p className="text-center text-rose-600 text-sm">{sendError}</p>}
        {opError && <p className="text-center text-rose-600 text-sm">{opError}</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 pt-3 border-t border-ink-200">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendImage(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="btn-secondary px-3 disabled:opacity-60"
          title="发送图片"
        >
          {uploading ? '上传中…' : '图片'}
        </button>
        <input
          aria-label="输入私信内容"
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
