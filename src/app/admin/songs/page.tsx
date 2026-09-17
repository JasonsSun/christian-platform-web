'use client';

import { Fragment, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { apiPatch, apiPost } from '@/lib/api';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface AdminSong {
  id: string; title: string; author: string; category: string; tags: string;
  hasAudio: boolean; playCount: number; favoriteCount: number; lyricsLen: number; createdAt: string;
  audioType: 'vocal' | 'instrumental' | 'none'; audioCredit: string;
  listenUrl: string; listenSource: string;
  chords: string; originalKey: string;
  source: string; status: string; submitterName: string;
}

const AUDIO_TYPE_LABEL: Record<string, string> = {
  vocal: '人声',
  instrumental: '伴奏',
  none: '无音频',
};

type AudioType = 'vocal' | 'instrumental' | 'none';
type EditMode = 'type' | 'listen';

/** 内联编辑态：不再用 window.prompt（全站无弹框守卫已把 prompt 置为恒返回 null） */
interface Editor {
  id: string;
  mode: EditMode;
  audioType: AudioType;
  credit: string;
  listenUrl: string;
  listenSource: string;
  chords: string;
  originalKey: string;
}

export default function AdminSongsPage() {
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const [tip, setTip] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    created: number; skipped: number; errors: number; detail: { created: string[]; skipped: string[]; errors: { line: number; title: string; reason: string }[] };
  } | null>(null);
  const [batchErr, setBatchErr] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: AdminSong[]; total: number;
    byCategory: { category: string; c: number }[];
    byAudioType: { audioType: string; c: number }[];
  }>(`/admin/songs?q=${encodeURIComponent(q)}`, [q]);
  const items = data?.items || [];
  const totalPlays = items.reduce((a, b) => a + b.playCount, 0);
  const totalFav = items.reduce((a, b) => a + b.favoriteCount, 0);
  const vocalCount = (data?.byAudioType || []).find((t) => t.audioType === 'vocal')?.c ?? 0;

  /** 打开「音频类型」内联编辑器（人工试听后更正：伴奏↔人声↔无音频） */
  function openTypeEditor(song: AdminSong, next: AudioType) {
    setTip('');
    if (next === 'vocal' && !song.hasAudio) {
      setTip(`「${song.title}」没有音频文件，不能标为人声`);
      return;
    }
    setEditor({
      id: song.id,
      mode: 'type',
      audioType: next,
      credit: song.audioCredit || '',
      listenUrl: song.listenUrl || '',
      listenSource: song.listenSource || '',
      chords: song.chords || '',
      originalKey: song.originalKey || '',
    });
  }

  /**
   * 打开「人声版外链」内联编辑器。
   * 平台不搬运版权音频,只存链接;链接留空保存＝清除,前台自动降级为按歌名搜索。
   */
  function openListenEditor(song: AdminSong) {
    setTip('');
    setEditor({
      id: song.id,
      mode: 'listen',
      audioType: song.audioType,
      credit: song.audioCredit || '',
      listenUrl: song.listenUrl || '',
      listenSource: song.listenSource || '',
      chords: song.chords || '',
      originalKey: song.originalKey || '',
    });
  }

  /** 保存内联编辑器内容并刷新列表 */
  async function saveEditor(song: AdminSong) {
    if (!editor) return;
    const patch: Record<string, unknown> = {};
    if (editor.mode === 'type') {
      if (editor.audioType !== 'none' && !editor.credit.trim() && !song.audioCredit) {
        setTip('标记有音频时必须填写演唱者与授权说明');
        return;
      }
      patch.audioType = editor.audioType;
      patch.audioCredit = editor.credit.trim();
    } else {
      const url = editor.listenUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) {
        setTip('链接必须以 http(s) 开头');
        return;
      }
      patch.listenUrl = url;
      patch.listenSource = url ? editor.listenSource.trim() || '外部平台' : '';
    }
    // 和弦谱与原调：无论当前编辑模式，只要与原始值不同就一并保存（用户主动清空＝清除）
    if ((editor.chords || '') !== (song.chords || '')) patch.chords = editor.chords;
    if ((editor.originalKey || '').trim() !== (song.originalKey || '')) patch.originalKey = editor.originalKey.trim();
    setBusyId(song.id);
    setTip('');
    try {
      await apiPatch(`/admin/songs/${song.id}`, patch);
      setTip(
        editor.mode === 'type'
          ? `「${song.title}」已改标为${AUDIO_TYPE_LABEL[editor.audioType]}`
          : patch.listenUrl
            ? `「${song.title}」已登记 ${patch.listenSource} 试听链接`
            : `「${song.title}」的外部链接已清除`
      );
      setEditor(null);
      reload();
    } catch (e: any) {
      setTip(e?.message || '更新失败');
    } finally {
      setBusyId('');
    }
  }

  /** 批量导入诗歌：提交纯文本，刷新列表 */
  async function runBatch() {
    if (!batchText.trim()) {
      setBatchErr('请先粘贴诗歌文本');
      return;
    }
    setBatchBusy(true);
    setBatchErr('');
    setBatchResult(null);
    try {
      const r = await apiPost('/admin/songs/batch', { text: batchText });
      setBatchResult(r as typeof batchResult);
      setBatchText('');
      reload();
    } catch (e: any) {
      setBatchErr(e?.message || '批量导入失败');
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <AdminLayout>
      <SectionTitle>赞美诗管理</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">诗歌、歌词、曲谱、音频与播放/收藏统计</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="诗歌总数" value={data?.total ?? '—'} />
        <StatCard title="其中人声版" value={vocalCount} />
        <StatCard title="本页播放量" value={totalPlays} />
        <StatCard title="本页收藏数" value={totalFav} />
      </div>

      {tip && (
        <p className="mb-4 text-sm rounded-xl px-3 py-2 bg-primary-50 text-primary-700">{tip}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="input-styled flex-1 min-w-[180px]"
          placeholder="搜索诗歌标题 / 作者 / 标签"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex items-center gap-1 flex-wrap">
          {(data?.byAudioType || []).map((t) => (
            <Badge key={t.audioType} tone={t.audioType === 'vocal' ? 'green' : t.audioType === 'instrumental' ? 'gold' : 'gray'}>
              {AUDIO_TYPE_LABEL[t.audioType] || t.audioType} · {t.c}
            </Badge>
          ))}
          {(data?.byCategory || []).map((c) => (
            <Badge key={c.category} tone="gold">{c.category} · {c.c}</Badge>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setBatchOpen(true); setBatchResult(null); setBatchErr(''); }}
          className="ml-auto text-sm px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 whitespace-nowrap"
        >
          批量导入
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Empty label="暂无诗歌" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">诗歌</th>
                <th className="text-left px-4 py-3 font-medium">分类</th>
                <th className="text-center px-4 py-3 font-medium">歌词</th>
                <th className="text-center px-4 py-3 font-medium">音频类型</th>
                <th className="text-center px-4 py-3 font-medium">人声版外链</th>
                <th className="text-center px-4 py-3 font-medium">播放</th>
                <th className="text-center px-4 py-3 font-medium">收藏</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <Fragment key={s.id}>
                <tr className="border-t border-ink-100 hover:bg-primary-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{s.title}</div>
                    <div className="text-xs text-ink-400">{s.author || '佚名'}{s.tags ? ` · ${s.tags}` : ''}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone="primary">{s.category}</Badge></td>
                  <td className="px-4 py-3 text-center text-ink-600">{s.lyricsLen > 0 ? `${s.lyricsLen}字` : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex flex-col items-center gap-1">
                      <select
                        value={s.audioType}
                        disabled={busyId === s.id}
                        onChange={(e) => openTypeEditor(s, e.target.value as AudioType)}
                        title={s.audioCredit || AUDIO_TYPE_LABEL[s.audioType]}
                        className={`text-xs rounded-full px-2 py-1 border cursor-pointer disabled:opacity-50 ${
                          s.audioType === 'vocal'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : s.audioType === 'instrumental'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-ink-100 text-ink-500 border-ink-200'
                        }`}
                      >
                        <option value="vocal">人声</option>
                        <option value="instrumental">伴奏</option>
                        <option value="none">无音频</option>
                      </select>
                      {s.audioCredit && (
                        <span className="text-[10px] text-ink-400 max-w-[160px] truncate" title={s.audioCredit}>{s.audioCredit}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.listenUrl ? (
                      <div className="inline-flex flex-col items-center gap-1">
                        <a
                          href={s.listenUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          title={s.listenUrl}
                        >
                          {s.listenSource || '外部'} ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => openListenEditor(s)}
                          disabled={busyId === s.id}
                          className="text-[10px] text-ink-400 hover:text-primary-600 disabled:opacity-50"
                        >
                          修改
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openListenEditor(s)}
                        disabled={busyId === s.id}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
                      >
                        登记链接
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-ink-900">{s.playCount}</td>
                  <td className="px-4 py-3 text-center text-ink-700">{s.favoriteCount}</td>
                </tr>
                {editor?.id === s.id && (
                  <tr className="border-t border-primary-100 bg-primary-50/70">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {editor.mode === 'type' ? (
                          <>
                            <span className="text-xs text-ink-500">音频类型</span>
                            <select
                              value={editor.audioType}
                              disabled={busyId === s.id}
                              onChange={(e) => setEditor({ ...editor, audioType: e.target.value as AudioType })}
                              className="text-xs rounded-full px-2 py-1 border border-ink-200 bg-white cursor-pointer disabled:opacity-50"
                            >
                              <option value="vocal">人声</option>
                              <option value="instrumental">伴奏</option>
                              <option value="none">无音频</option>
                            </select>
                            {editor.audioType !== 'none' && (
                              <>
                                <span className="text-xs text-ink-500 ml-2">演唱者与授权说明</span>
                                <input
                                  className="input-styled text-xs py-1 flex-1 min-w-[240px]"
                                  placeholder="演唱：光盐诗班 / 已获教会授权"
                                  value={editor.credit}
                                  onChange={(e) => setEditor({ ...editor, credit: e.target.value })}
                                />
                              </>
                            )}
                            {editor.audioType === 'vocal' && !s.hasAudio && (
                              <span className="text-xs text-rose-600">该诗没有音频文件，无法标为人声</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-ink-500">人声试听链接</span>
                            <input
                              className="input-styled text-xs py-1 flex-1 min-w-[260px]"
                              placeholder="https://…（留空并保存＝清除）"
                              value={editor.listenUrl}
                              onChange={(e) => setEditor({ ...editor, listenUrl: e.target.value })}
                            />
                            <span className="text-xs text-ink-500 ml-2">来源名</span>
                            <input
                              className="input-styled text-xs py-1 w-[150px]"
                              placeholder="B站 / 网易云"
                              value={editor.listenSource}
                              onChange={(e) => setEditor({ ...editor, listenSource: e.target.value })}
                            />
                          </>
                        )}
                        <div className="flex items-center gap-2 w-full mt-2 pt-2 border-t border-primary-200">
                          <span className="text-xs text-ink-500">和弦谱</span>
                          <textarea
                            className="input-styled text-xs py-1 flex-1 min-w-[260px] font-mono"
                            rows={2}
                            placeholder="用 [和弦] 标记，例如：[C]Amazing [G]grace"
                            value={editor.chords}
                            onChange={(e) => setEditor({ ...editor, chords: e.target.value })}
                          />
                          <span className="text-xs text-ink-500 ml-2">原调</span>
                          <input
                            className="input-styled text-xs py-1 w-[90px]"
                            placeholder="如 C / Am"
                            value={editor.originalKey}
                            maxLength={8}
                            onChange={(e) => setEditor({ ...editor, originalKey: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            onClick={() => saveEditor(s)}
                            disabled={busyId === s.id || (editor.mode === 'type' && editor.audioType === 'vocal' && !s.hasAudio)}
                            className="text-xs px-3 py-1 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {busyId === s.id ? '保存中…' : '保存'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditor(null)}
                            disabled={busyId === s.id}
                            className="text-xs px-3 py-1 rounded-full bg-white text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => !batchBusy && setBatchOpen(false)}>
          <div className="w-full max-w-2xl glass rounded-2xl shadow-soft p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-ink-900">批量导入诗歌</h3>
              <button
                type="button"
                onClick={() => !batchBusy && setBatchOpen(false)}
                className="text-ink-400 hover:text-ink-700 text-sm"
              >
                关闭
              </button>
            </div>
            <p className="text-xs text-ink-500 mb-2 leading-relaxed">
              每首以独立 <code className="bg-ink-100 px-1 rounded">---</code> 行分隔（或以 <code className="bg-ink-100 px-1 rounded"># 标题</code> 分段）。支持字段：
              <code className="bg-ink-100 px-1 rounded">作者/分类/原调/标签/和弦</code>（和弦段与歌词之间留空行）。
            </p>
            <textarea
              className="input-styled w-full font-mono text-xs"
              rows={10}
              placeholder={'# 奇异恩典\n作者：约翰·牛顿\n分类：恩典\n原调：G\n标签：救恩, 安慰\n\n[C]Amazing [G]grace how [Am]sweet the [F]sound\n\n---\n# 第二首\n作者：佚名\n歌词内容…'}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            {batchErr && <p className="text-rose-600 text-xs mt-2">{batchErr}</p>}
            {batchResult && (
              <div className="mt-3 text-xs rounded-xl bg-emerald-50 text-emerald-800 px-3 py-2 space-y-1">
                <p>导入完成：新建 {batchResult.created} 首 · 跳过 {batchResult.skipped} 首 · 错误 {batchResult.errors} 首</p>
                {batchResult.detail.skipped.length > 0 && (
                  <p className="text-emerald-700/80">跳过：{batchResult.detail.skipped.join('、')}</p>
                )}
                {batchResult.detail.errors.length > 0 && (
                  <p className="text-rose-600">错误：{batchResult.detail.errors.map((e) => `第${e.line}行 ${e.title}(${e.reason})`).join('；')}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-4 justify-end">
              <button
                type="button"
                onClick={() => { setBatchOpen(false); setBatchResult(null); setBatchErr(''); }}
                disabled={batchBusy}
                className="text-sm px-4 py-2 rounded-xl bg-white text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={runBatch}
                disabled={batchBusy || !batchText.trim()}
                className="text-sm px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {batchBusy ? '导入中…' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
