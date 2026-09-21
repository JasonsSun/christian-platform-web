'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { timeAgo, formatTimestamp } from '@/lib/format';
import { IconMicWave, IconBookOpen, IconPlay, IconHeart } from '@/components/icons';

interface Sermon {
  id: string;
  seriesId: string | null;
  seriesTitle: string | null;
  title: string;
  speaker: string;
  scripture: string;
  preachedAt: string | null;
  description: string;
  mediaType: 'audio' | 'video' | 'none';
  mediaUrl: string;
  durationSec: number;
  cover: string;
  viewCount: number;
  likeCount: number;
  status: string;
  createdAt: string;
}

interface ListResp {
  items: Sermon[];
  total: number;
  speakers: string[];
}

/** 接口侧 pageSize 上限为 50 */
const PAGE_SIZE = 24;

export default function SermonsPage() {
  const { t, convert } = useI18n();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [sort, setSort] = useState('new');

  // 搜索框防抖：q 进了 deps 就是每敲一个字发一个请求。过期响应 useApi 已经会丢弃，
  // 不再「后发的先回」把列表停在打了一半的关键词上，但每个字仍是一次真实往返
  // （挂载后一律 noCache），350ms 合并一次就够（与 /devotions 同一做法）
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  const query = `q=${encodeURIComponent(q)}&seriesId=${seriesId}&speaker=${encodeURIComponent(speaker)}&sort=${sort}`;
  const { data: seriesData } = useApi<{ items: { id: string; title: string }[] }>('/sermon-series');
  const { data, loading, error, reload } = useApi<ListResp>(`/sermons?${query}&pageSize=${PAGE_SIZE}`, [
    q,
    seriesId,
    speaker,
    sort,
  ]);

  // 追加页与筛选条件绑定：换了系列/讲员却没清空追加项，列表里会混进上一次筛选的结果
  const [extra, setExtra] = useState<Sermon[]>([]);
  const [page, setPage] = useState(1);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setPage(1);
    setMoreError(null);
  }, [q, seriesId, speaker, sort]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: Sermon[] = [];
    for (const s of [...(data?.items || []), ...extra]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [data, extra]);

  const total = data?.total ?? 0;
  const hasMore = items.length > 0 && items.length < total;
  // 换系列/讲员/排序时 useApi 会留着旧 data 只把 loading 抬起来。
  // 整块列表跟着 loading 拆掉重装就是「整页空白 → 弹回来」，
  // 后台表格用 TableShell 的 busy 压暗解决，这里同一个口径。
  const busy = loading && items.length > 0;

  async function loadMore() {
    setMoreLoading(true);
    setMoreError(null);
    try {
      const r = await apiGet<ListResp>(`/sermons?${query}&page=${page + 1}&pageSize=${PAGE_SIZE}`);
      setExtra((cur) => [...cur, ...(r.items || [])]);
      setPage((p) => p + 1);
    } catch (e: any) {
      setMoreError(e?.message || '加载更多失败，请稍后重试');
    } finally {
      setMoreLoading(false);
    }
  }

  const speakers = data?.speakers || [];

  const titleEl = useMemo(() => convert(t('nav.sermons')), [t]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">{titleEl}</h1>
          <p className="text-ink-500 mt-1">教会讲道录音与视频，按系列与讲员整理，供反复聆听、喂养灵命。</p>
        </div>
        <Link href="/admin/sermons" className="btn-secondary text-sm">
          管理讲道
        </Link>
      </div>

      {/* 筛选条：.input-styled 自带 w-full，放在 flex-wrap 里会各占一行
          （桌面上下拉排成三条），改成和 /activities /groups 一样的网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <input
          aria-label="搜索讲道"
          className="input-styled"
          placeholder="搜索标题 / 讲员 / 经文"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <select aria-label="讲道系列筛选" className="input-styled" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
          <option value="">全部系列</option>
          {(seriesData?.items || []).map((s) => (
            <option key={s.id} value={s.id}>{convert(s.title)}</option>
          ))}
        </select>
        <select aria-label="讲员筛选" className="input-styled" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
          <option value="">全部讲员</option>
          {speakers.map((sp) => (
            <option key={sp} value={sp}>{convert(sp)}</option>
          ))}
        </select>
        <select aria-label="讲道排序" className="input-styled" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">最近讲道</option>
          <option value="old">最早讲道</option>
          <option value="hot">最受欢迎</option>
        </select>
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center text-ink-400 py-20">加载中…</div>
      ) : error && items.length === 0 ? (
        <div className="text-center text-rose-600 py-20">
          {error} <button onClick={reload} className="underline ml-2">重试</button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-ink-400 py-20">
          {q || seriesId || speaker ? '没有符合当前筛选的讲道。' : '暂无讲道，敬请期待。'}
          {q || seriesId || speaker ? (
            <button
              onClick={() => { setInput(''); setQ(''); setSeriesId(''); setSpeaker(''); }}
              className="block mx-auto mt-3 text-sm text-primary-600 hover:underline"
            >
              清除筛选
            </button>
          ) : null}
        </div>
      ) : (
        <div data-reveal-group className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 transition-opacity duration-200 ${busy ? 'opacity-60' : 'opacity-100'}`}>
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/sermons/${s.id}`}
              data-spot
              className="glass spot rounded-2xl overflow-hidden shadow-soft hover:shadow-card transition group"
            >
              <div className="aspect-video bg-gradient-to-br from-primary-600 to-primary-800 relative flex items-center justify-center">
                {s.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.cover} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <IconMicWave className="w-14 h-14 text-white/70" strokeWidth={1.2} />
                )}
                <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">
                  {s.mediaType === 'audio' ? '音频' : s.mediaType === 'video' ? '视频' : '文稿'}
                </span>
                {formatTimestamp(s.durationSec) ? (
                  <span className="num absolute bottom-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-white">
                    {formatTimestamp(s.durationSec)}
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-ink-900 line-clamp-2 group-hover:text-primary-700 transition">
                  {convert(s.title)}
                </h3>
                <div className="text-sm text-ink-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {s.speaker ? (
                    <span className="inline-flex items-center gap-1">
                      <IconMicWave className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      {convert(s.speaker)}
                    </span>
                  ) : null}
                  {s.scripture ? (
                    <span className="inline-flex items-center gap-1">
                      <IconBookOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      {convert(s.scripture)}
                    </span>
                  ) : null}
                </div>
                <div className="num text-xs text-ink-400 mt-2 flex items-center gap-3">
                  {s.preachedAt ? <span>{s.preachedAt}</span> : <span>{timeAgo(s.createdAt)}</span>}
                  <span className="inline-flex items-center gap-1">
                    <IconPlay className="w-3 h-3" strokeWidth={1.8} />
                    <span className="sr-only">播放</span>
                    {s.viewCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <IconHeart className="w-3 h-3" strokeWidth={1.8} />
                    <span className="sr-only">点赞</span>
                    {s.likeCount}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {items.length > 0 && !loading ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          {/* 列表留着旧结果，失败就得在这儿说：不报出来会变成「筛了半天没反应」 */}
          {error ? (
            <p role="alert" className="text-sm text-rose-600">
              {error} <button onClick={reload} className="underline ml-1">重试</button>
            </p>
          ) : hasMore ? (
            <button onClick={loadMore} disabled={moreLoading} className="btn-secondary">
              {moreLoading ? '加载中…' : `加载更多（还有 ${Math.max(0, total - items.length)} 篇）`}
            </button>
          ) : (
            <p className="text-xs text-ink-400">已显示全部 {total} 篇</p>
          )}
          {moreError && (
            <p role="alert" className="text-xs text-rose-600">
              {moreError} <button onClick={loadMore} className="underline ml-1">重试</button>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
