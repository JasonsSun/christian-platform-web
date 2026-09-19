'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { timeAgo } from '@/lib/format';

const CATEGORIES = [
  { value: 'idea', label: '功能建议', icon: '💡' },
  { value: 'bug', label: '问题反馈', icon: '🐞' },
  { value: 'content', label: '内容相关', icon: '📖' },
  { value: 'ux', label: '使用体验', icon: '🎨' },
  { value: 'other', label: '其他', icon: '💬' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: '待查看', cls: 'bg-amber-50 text-amber-700' },
  processing: { label: '处理中', cls: 'bg-primary-50 text-primary-700' },
  done: { label: '已采纳/已处理', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '暂不处理', cls: 'bg-ink-100 text-ink-600' },
};

interface FeedbackItem {
  id: string;
  category: string;
  content: string;
  status: string;
  adminReply: string;
  createdAt: string;
}

/**
 * 给平台提建议。
 * 提交后仅管理员可见，用于了解使用者需求、决定后续开发方向。
 */
export default function FeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const notice = useNotice();
  const action = useAction();

  const [category, setCategory] = useState('idea');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');

  const { data, loading, reload } = useApi<{ items: FeedbackItem[] }>(user ? '/feedback' : null, [user]);
  const items = data?.items || [];

  async function submit() {
    const text = content.trim();
    if (text.length < 5) {
      notice.info('请至少写 5 个字，方便我们理解你的想法');
      return;
    }
    const res = await action.run(() =>
      apiPost<{ ok: boolean; id: string }>('/feedback', {
        category,
        content: text,
        contact: contact.trim() || undefined,
        pageUrl: typeof document !== 'undefined' ? document.referrer.slice(0, 255) : undefined,
      })
    );
    if (res) {
      setContent('');
      setContact('');
      notice.success('建议已提交，感谢你的反馈');
      reload();
    }
  }

  if (authLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🔒</div>
        <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h1>
        <p className="text-ink-500 mb-6">登录后即可给平台提建议，我们会认真阅读每一条</p>
        <Link href="/login" className="btn-primary inline-block">去登录</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-1">给平台提建议</h1>
      <p className="text-ink-500 text-sm mb-6">
        你的建议只有管理员能看到。想加什么功能、哪里不好用、发现什么问题，都可以直接写给我们。
      </p>

      <div className="glass rounded-3xl p-6 shadow-card mb-8">
        <label id="feedback-category-label" className="block text-xs font-semibold text-ink-500 mb-2">建议类型</label>
        <div className="flex flex-wrap gap-2 mb-5" role="group" aria-labelledby="feedback-category-label">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                category === c.value
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              <span className="mr-1" aria-hidden="true">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        <label htmlFor="feedback-content" className="block text-xs font-semibold text-ink-500 mb-2">
          具体内容 <span className="text-ink-400 font-normal">（5–1000 字）</span>
        </label>
        <textarea
          id="feedback-content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          className="input-styled min-h-[160px]"
          placeholder="例如：希望在首页加一个「今日经文」卡片；手机端诗歌播放器按钮太小，容易点错…"
        />
        <div className="text-right text-xs text-ink-400 mt-1">{content.length}/1000</div>

        <label htmlFor="feedback-contact" className="block text-xs font-semibold text-ink-500 mb-2 mt-4">
          联系方式 <span className="text-ink-400 font-normal">（选填，便于我们回访）</span>
        </label>
        <input
          id="feedback-contact"
          name="contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={120}
          className="input-styled"
          placeholder="微信号 / 邮箱，可留空"
        />

        {action.error && <p role="alert" className="text-sm text-rose-600 mt-3">{action.error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={action.pending}
          className="btn-primary w-full mt-5 disabled:opacity-70"
        >
          {action.pending ? '提交中…' : '提交建议'}
        </button>
      </div>

      <h2 className="font-display text-lg font-bold text-ink-900 mb-3">我提交过的建议</h2>

      {loading && <div className="py-10 text-center text-ink-400">加载中…</div>}
      {!loading && items.length === 0 && (
        <div className="py-10 text-center text-ink-400 border border-dashed border-ink-200 rounded-2xl">
          还没有提交过建议
        </div>
      )}

      <div className="space-y-3">
        {items.map((it) => {
          const meta = STATUS_META[it.status] || { label: it.status, cls: 'bg-ink-100 text-ink-600' };
          return (
            <div key={it.id} className="bg-white rounded-2xl p-4 border border-ink-100 shadow-soft">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-600 text-xs font-medium">
                  {CATEGORY_LABEL[it.category] || it.category}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                <span className="text-xs text-ink-400 ml-auto">{timeAgo(it.createdAt)}</span>
              </div>
              <p className="text-sm text-ink-700 whitespace-pre-wrap">{it.content}</p>
              {it.adminReply && (
                <div className="mt-3 p-3 rounded-xl bg-primary-50/60 border border-primary-100">
                  <p className="text-xs font-semibold text-primary-700 mb-1">管理员回复</p>
                  <p className="text-sm text-ink-700 whitespace-pre-wrap">{it.adminReply}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
