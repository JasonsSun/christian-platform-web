'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { apiPatch } from '@/lib/api';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface AdminSong {
  id: string; title: string; author: string; category: string; tags: string;
  hasAudio: boolean; playCount: number; favoriteCount: number; lyricsLen: number; createdAt: string;
  audioType: 'vocal' | 'instrumental' | 'none'; audioCredit: string;
  listenUrl: string; listenSource: string;
  source: string; status: string; submitterName: string;
}

const AUDIO_TYPE_LABEL: Record<string, string> = {
  vocal: '人声',
  instrumental: '伴奏',
  none: '无音频',
};

export default function AdminSongsPage() {
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const [tip, setTip] = useState('');
  const { data, loading, error, reload } = useApi<{
    items: AdminSong[]; total: number;
    byCategory: { category: string; c: number }[];
    byAudioType: { audioType: string; c: number }[];
  }>(`/admin/songs?q=${encodeURIComponent(q)}`, [q]);
  const items = data?.items || [];
  const totalPlays = items.reduce((a, b) => a + b.playCount, 0);
  const totalFav = items.reduce((a, b) => a + b.favoriteCount, 0);
  const vocalCount = (data?.byAudioType || []).find((t) => t.audioType === 'vocal')?.c ?? 0;

  /** 人工试听后更正音频类型：把伴奏改标人声，或纠正标错的记录 */
  async function changeType(song: AdminSong, next: 'vocal' | 'instrumental' | 'none') {
    if (next === song.audioType) return;
    if (next === 'vocal' && !song.hasAudio) {
      setTip(`「${song.title}」没有音频文件，不能标为人声`);
      return;
    }
    let credit = song.audioCredit;
    if (next !== 'none' && !credit) {
      const input = window.prompt('标记为有音频需要填写演唱者与授权说明，例如：演唱：光盐诗班 / 已获教会授权', '');
      if (input === null) return;
      if (!input.trim()) { setTip('未填写授权说明，已取消'); return; }
      credit = input.trim();
    }
    setBusyId(song.id);
    setTip('');
    try {
      await apiPatch(`/admin/songs/${song.id}`, { audioType: next, audioCredit: credit });
      setTip(`「${song.title}」已改标为${AUDIO_TYPE_LABEL[next]}`);
      reload();
    } catch (e: any) {
      setTip(e?.message || '更新失败');
    } finally {
      setBusyId('');
    }
  }

  /**
   * 登记/修改这首歌的外部人声试听入口。
   * 平台不搬运版权音频,只存链接;留空则清除,前台自动降级为按歌名搜索。
   */
  async function editListen(song: AdminSong) {
    const url = window.prompt(
      `登记「${song.title}」的人声试听链接（http(s) 开头，留空则清除）\n请先确认那个页面确实是真人演唱版：`,
      song.listenUrl || ''
    );
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setTip('链接必须以 http(s) 开头');
      return;
    }
    let source = song.listenSource || '';
    if (trimmed) {
      const input = window.prompt('来源名（会显示在按钮上，如 B站 / 网易云 / 教会授权）', source || 'B站');
      if (input === null) return;
      source = input.trim() || '外部平台';
    } else {
      source = '';
    }
    setBusyId(song.id);
    setTip('');
    try {
      await apiPatch(`/admin/songs/${song.id}`, { listenUrl: trimmed, listenSource: source });
      setTip(trimmed ? `「${song.title}」已登记 ${source} 试听链接` : `「${song.title}」的外部链接已清除`);
      reload();
    } catch (e: any) {
      setTip(e?.message || '更新失败');
    } finally {
      setBusyId('');
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
                <tr key={s.id} className="border-t border-ink-100 hover:bg-primary-50/40">
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
                        onChange={(e) => changeType(s, e.target.value as any)}
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
                          onClick={() => editListen(s)}
                          disabled={busyId === s.id}
                          className="text-[10px] text-ink-400 hover:text-primary-600 disabled:opacity-50"
                        >
                          修改
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => editListen(s)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
