'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/useApi';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import { Empty } from '@/components/ui';
import type { ContentItem, MediaItem } from '@/lib/types';
import { Glyph, IconCheck, IconPencil, IconPray, IconSparkles } from '@/components/icons';

const CONTENT_TYPES = [
  { id: 'article', label: '文章', Icon: IconPencil },
  { id: 'testimony', label: '见证', Icon: IconSparkles },
  { id: 'devotion', label: '灵修', Icon: IconPray },
];

const COVER_EMOJIS = ['📖', '✨', '🙏', '🌿', '❤️', '🌟', '☀️', '🌈', '🔥', '💡', '🌸', '🕊️'];
// 运行时探针（probe-axnames）实测这 12 个按钮的可访问名称只剩一个 emoji 字符，
// 读屏念出的是「图形」或干脆不出声。给每个配一个中文名字，视觉不变。
const COVER_NAMES = ['经书', '闪光', '祷告', '橄榄枝', '爱心', '星星', '太阳', '彩虹', '火焰', '灵感', '花朵', '鸽子'];

export default function CreateContentPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();
  const [formError, setFormError] = useState('');

  const [editId, setEditId] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState<'article' | 'testimony' | 'devotion'>('article');
  const [tagsInput, setTagsInput] = useState('');
  const [cover, setCover] = useState(COVER_EMOJIS[0]);
  const [mediaIds, setMediaIds] = useState<string[]>([]);

  const { data: mediaData } = useApi<{ items: MediaItem[] }>(user && !editId ? '/media/mine?pageSize=30' : null, [user?.id]);
  const myMedia = (mediaData?.items || []).filter((m) => m.status !== 'trashed');

  const toggleMedia = (id: string) =>
    setMediaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const action = useAction();

  // 同 /activities/new：匿名不再「先画表单再 effect 送去 /login」，改成原地登录门。
  const needsLogin = !loading && !user;

  // 编辑模式：从 URL ?edit=<id> 载入原文
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit') || '';
    if (!id || !user) return;
    setEditId(id);
    setLoadingEdit(true);
    setEditError('');
    apiGet<ContentItem>(`/contents/${id}`)
      .then((c) => {
        setTitle(c.title || '');
        setBody(c.body || '');
        setContentType((c.contentType as any) || 'article');
        setTagsInput((c.tags || []).join('，'));
        setCover(c.cover || COVER_EMOJIS[0]);
      })
      .catch((e) => setEditError(e?.message || '加载内容失败'))
      .finally(() => setLoadingEdit(false));
  }, [user]);

  const submit = async (status: 'draft' | 'pending_review') => {
    setFormError('');
    if (!user) {
      notice.info('请先登录后再发布内容');
      goLogin();
      return;
    }
    if (!title.trim()) {
      setFormError('请填写标题');
      notice.error('请填写标题');
      return;
    }
    if (!body.trim()) {
      setFormError('请填写正文');
      notice.error('请填写正文');
      return;
    }
    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    // 编辑模式：PATCH 更新已有内容。status 一并传过去 —— 作者可以「存草稿」，
    // 否则改了正文会直接进入待审核。
    if (editId) {
      const res = await action.run(() =>
        apiPatch<{ id: string; updated: boolean }>(`/contents/${editId}`, {
          title: title.trim(),
          body: body.trim(),
          contentType,
          tags,
          cover,
          status,
        })
      );
      if (res?.id) {
        notice.success(status === 'draft' ? '草稿已保存' : '已提交，等待审核');
        router.push(status === 'draft' ? '/me?tab=drafts' : `/contents/${res.id}`);
      }
      return;
    }

    const res = await action.run(() =>
      apiPost<ContentItem>('/contents', {
        title: title.trim(),
        body: body.trim(),
        contentType,
        tags,
        cover,
        status,
        mediaIds,
      })
    );
    if (res?.id) {
      router.push(`/contents/${res.id}`);
    }
  };

  return (
    <div className="min-h-screen">
      <section className="relative py-8 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="eyebrow mb-2"><span className="text-gold-200/90">{editId ? 'EDIT' : 'PUBLISH'}</span></div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{editId ? '编辑内容' : '发布内容'}</h1>
          <p className="text-white/80 mt-2 text-sm">{editId ? '修改后重新提交审核' : '与主内肢体分享你的文章、见证或灵修'}</p>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {needsLogin ? (
            <Empty label="登录后即可发布内容" hint="文章、见证、灵修都需先登录才能提交，也便于审核后通知你。">
              <button type="button" className="btn-primary" onClick={() => goLogin()}>
                去登录
              </button>
              <Link href="/community" className="btn-secondary">
                先看看社区
              </Link>
            </Empty>
          ) : (
          <div data-spot className="spot bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100 space-y-6">
            {loadingEdit && (
              <div className="space-y-3 py-2">
                <div className="h-4 w-28 bg-ink-100 rounded skeleton-sheen" />
                <div className="h-10 bg-ink-100 rounded-xl skeleton-sheen" />
                <div className="h-40 bg-ink-100 rounded-xl skeleton-sheen" />
              </div>
            )}
            {editError && (
              <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{editError}</div>
            )}
            {/* 表单内联错误提示（不使用弹框） */}
            {formError && (
              <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
                {formError}
              </div>
            )}
            {/* 类型选择 */}
            <div>
              <label id="content-type-label" className="block text-sm font-semibold text-ink-700 mb-2">内容类型</label>
              <div className="flex gap-2" role="group" aria-labelledby="content-type-label">
                {CONTENT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setContentType(t.id as any)}
                    aria-pressed={contentType === t.id}
                    className={`flex-1 min-w-0 whitespace-nowrap px-2 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      contentType === t.id
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                        : 'bg-white text-ink-600 border border-ink-200 hover:border-primary-300'
                    }`}
                  >
                    <t.Icon className="w-4 h-4" strokeWidth={1.6} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 标题 */}
            <div>
              <label htmlFor="content-title" className="block text-sm font-semibold text-ink-700 mb-2">标题</label>
              <input
                id="content-title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给你的内容起个标题…"
                className="input-styled"
              />
            </div>

            {/* 正文 */}
            <div>
              <label htmlFor="content-body" className="block text-sm font-semibold text-ink-700 mb-2">正文</label>
              <textarea
                id="content-body"
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="在这里写下你的内容…"
                rows={10}
                className="input-styled resize-y leading-relaxed"
              />
            </div>

            {/* 标签 */}
            <div>
              <label htmlFor="content-tags" className="block text-sm font-semibold text-ink-700 mb-2">标签（逗号分隔）</label>
              <input
                id="content-tags"
                name="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="例如：信心, 祷告, 恩典"
                className="input-styled"
              />
            </div>

            {/* 封面 emoji */}
            <div>
              <label id="content-cover-label" className="block text-sm font-semibold text-ink-700 mb-2">封面图标</label>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="content-cover-label">
                {COVER_EMOJIS.map((e, i) => (
                  <button
                    key={e}
                    onClick={() => setCover(e)}
                    aria-pressed={cover === e}
                    aria-label={`封面图标：${COVER_NAMES[i] ?? e}`}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                      cover === e
                        ? 'bg-primary-100 border-2 border-primary-500 text-primary-700'
                        : 'bg-ink-50 border-2 border-transparent text-ink-500 hover:border-primary-200'
                    }`}
                  >
                    <Glyph glyph={e} className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>

            {/* 附带媒体（编辑模式不更改附件） */}
            {!editId && (
            <div>
              <label id="content-media-label" className="block text-sm font-semibold text-ink-700 mb-2">
                附带媒体（可选）
                <span className="ml-2 font-normal text-xs text-ink-400">从「我的上传」选择图片/视频/音乐/资料</span>
              </label>
              {myMedia.length === 0 ? (
                <div className="text-sm text-ink-400 border border-dashed border-ink-200 rounded-xl px-4 py-3">
                  还没有可用的文件，<Link href="/upload" className="text-primary-600 hover:underline">去上传</Link>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="content-media-label">
                  {myMedia.map((m) => {
                    const on = mediaIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleMedia(m.id)}
                        aria-pressed={on}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${
                          on ? 'bg-primary-50 border-primary-400 text-primary-700' : 'bg-ink-50 border-transparent text-ink-600 hover:border-primary-200'
                        }`}
                      >
                        <Glyph
                          glyph={m.kind === 'image' ? '🖼' : m.kind === 'audio' ? '🎵' : m.kind === 'video' ? '🎬' : m.kind === 'score' ? '🎼' : '📄'}
                          className="w-4 h-4 shrink-0"
                        />
                        <span className="max-w-[140px] truncate">{m.title}</span>
                        {on ? <IconCheck className="w-4 h-4 text-primary-600 shrink-0" strokeWidth={1.6} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {action.error && (
              <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-sm">{action.error}</div>
            )}

            <div className="divider-gradient" />

            {editId ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => router.push(`/contents/${editId}`)} className="btn-secondary flex-1">
                  取消
                </button>
                <button onClick={() => submit('draft')} disabled={action.pending} className="btn-secondary flex-1">
                  存草稿
                </button>
                <button onClick={() => submit('pending_review')} disabled={action.pending} className="btn-primary flex-1">
                  {action.pending ? '保存中…' : '保存并提交审核'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => submit('draft')} disabled={action.pending} className="btn-secondary flex-1">
                    存草稿
                  </button>
                  <button onClick={() => submit('pending_review')} disabled={action.pending} className="btn-primary flex-1">
                    {action.pending ? '提交中…' : '提交审核'}
                  </button>
                </div>
                <p className="text-center text-xs text-ink-400">提交后将进入审核，通过后会展示在社区中。</p>
              </>
            )}
          </div>
          )}
        </div>
      </section>
    </div>
  );
}
