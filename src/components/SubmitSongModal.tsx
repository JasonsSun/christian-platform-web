'use client';

import { useState } from 'react';
import { apiForm } from '@/lib/api';
import Portal from '@/components/Portal';

/**
 * 投稿赞美诗歌弹窗：可只填歌词、可附带音频文件、也可只给一个"这首在哪儿能听到
 * 人声版"的外链。收录为歌曲，待管理员审核。
 * 附带音频时必须明确"真人演唱 / 纯伴奏"，并填写演唱者与授权说明——
 * 平台会优先展示人声版本，标注不实的投稿会被驳回。
 * 外链只是登记来源，平台不会把对方的音频搬到自己服务器。
 */
export default function SubmitSongModal({
  onClose,
  onDone,
  presetTitle = '',
}: {
  onClose: () => void;
  onDone: () => void;
  presetTitle?: string;
}) {
  const [title, setTitle] = useState(presetTitle);
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('赞美');
  const [tags, setTags] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [chords, setChords] = useState('');
  const [originalKey, setOriginalKey] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  // 默认按"真人演唱"投稿：平台上缺的就是人声版本
  const [audioKind, setAudioKind] = useState<'vocal' | 'instrumental'>('vocal');
  const [credit, setCredit] = useState('');
  // 可选：不传音频，只登记"这首歌在哪儿能听到人声版"
  const [listenUrl, setListenUrl] = useState('');
  const [listenSource, setListenSource] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setMsg({ ok: false, text: '请填写诗歌标题' }); return; }
    if (!lyrics.trim()) { setMsg({ ok: false, text: '请填写歌词内容' }); return; }
    if (audio && !credit.trim()) { setMsg({ ok: false, text: '附带音频时必须填写演唱者与授权说明' }); return; }
    if (listenUrl.trim() && !/^https?:\/\//i.test(listenUrl.trim())) {
      setMsg({ ok: false, text: '外部试听链接必须是 http(s) 开头的地址' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set('title', title.trim());
      fd.set('author', author.trim());
      fd.set('category', category.trim());
      fd.set('tags', tags.trim());
      fd.set('lyrics', lyrics.trim());
      fd.set('chords', chords.trim());
      fd.set('originalKey', originalKey.trim());
      if (audio) {
        fd.set('audio', audio);
        fd.set('audioType', audioKind);
        fd.set('audioCredit', credit.trim());
      }
      if (listenUrl.trim()) {
        fd.set('listenUrl', listenUrl.trim());
        fd.set('listenSource', listenSource.trim() || '外部平台');
      }
      await apiForm<{ id: string; status: string }>('/songs/submit', fd);
      setMsg({ ok: true, text: '投稿成功！审核通过后即可被大家搜索到。' });
      setTimeout(onDone, 1500);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '投稿失败，请重试' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Portal>
    <div
      data-guard="submit-song-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-ink-900">投稿赞美诗歌</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">标题 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：奇异恩典" className="input-styled w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">作者</label>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="如：约翰·牛顿" className="input-styled w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">分类</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="赞美 / 灵修 / 圣诗" className="input-styled w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">标签（逗号分隔）</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="如：经典,恩典,救恩" className="input-styled w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">歌词 *</label>
            <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={6} placeholder="粘贴或输入歌词…" className="input-styled w-full" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-ink-700 mb-1">和弦谱（可选）</label>
              <textarea value={chords} onChange={(e) => setChords(e.target.value)} rows={4}
                placeholder={'用 [和弦] 标记，例如：\n[C]Amazing [G]grace how [Am]sweet the [F]sound'}
                className="input-styled w-full font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">原调</label>
              <input value={originalKey} onChange={(e) => setOriginalKey(e.target.value)} maxLength={8}
                placeholder="如 C / G / Am" className="input-styled w-full" />
            </div>
          </div>
          <p className="-mt-1 text-xs text-ink-400">有和弦谱时，诗歌详情页会以和弦谱形式展示，并支持一键移调。</p>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">音频文件（可选，mp3/wav/m4a，≤30MB）</label>
            <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] || null)} className="text-sm text-ink-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-gold-100 file:text-gold-700 file:text-sm file:font-medium" />
            {audio && <p className="text-xs text-ink-400 mt-1">{audio.name} ({Math.round(audio.size / 1024 / 1024 * 10) / 10}MB)</p>}
          </div>

          {audio && (
            <div className="rounded-2xl bg-gold-50/70 border border-gold-200 p-4 space-y-3">              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">这段音频是 *</label>
                <div className="flex gap-2">
                  {([
                    { id: 'vocal', label: '🎤 真人演唱' },
                    { id: 'instrumental', label: '🎹 纯伴奏' },
                  ] as const).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setAudioKind(o.id)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
                        audioKind === o.id
                          ? 'bg-gold-500 text-white shadow'
                          : 'bg-white text-ink-600 border border-ink-200 hover:border-gold-300'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-400 mt-1.5">
                  请如实选择。平台会优先展示人声版本，标注不实会导致投稿被驳回。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">演唱者与授权说明 *</label>
                <input
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                  placeholder="如：演唱：光盐诗班 / 已获教会授权发布"
                  className="input-styled w-full"
                />
                <p className="text-xs text-ink-400 mt-1.5">
                  请说明演唱者，以及你有权在本平台使用这段录音的依据（本人演唱 / 已获授权 / 已进入公有领域）。
                </p>
              </div>
            </div>
          )}

          {/* 没有音频也能帮上忙:登记一个外部人声版的收听入口 */}
          <div className="rounded-2xl bg-ink-50/70 border border-ink-100 p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                也可以只登记：这首歌的人声版在哪儿能听到？
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={listenSource}
                  onChange={(e) => setListenSource(e.target.value)}
                  placeholder="来源，如 B站"
                  maxLength={40}
                  className="input-styled w-full sm:w-32 shrink-0"
                />
                <input
                  value={listenUrl}
                  onChange={(e) => setListenUrl(e.target.value)}
                  placeholder="https:// 页面链接"
                  maxLength={500}
                  className="input-styled w-full"
                />
              </div>
              <p className="text-xs text-ink-400 mt-1.5">
                平台不转载别人的版权录音。你知道这首在哪个平台有演唱版，就把链接填在这里，
                审核通过后大家能从诗歌页跳过去听。
              </p>
            </div>
          </div>

          {msg && (
            <p className={`text-sm rounded-xl px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600'}`}>{msg.text}</p>
          )}
          <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
            {submitting ? '提交中…' : '提交投稿'}
          </button>
          <p className="text-xs text-ink-400 text-center">投稿需管理员审核通过后才会公开展示</p>
        </form>
      </div>
    </div>
    </Portal>
  );
}
