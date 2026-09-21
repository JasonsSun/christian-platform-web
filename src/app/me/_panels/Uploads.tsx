'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiDelete } from '@/lib/api';
import { useApi } from '@/lib/useApi';

import { formatDate, formatSize } from '@/lib/format';
import { contentStatusLabel } from '@/lib/labels';
import type { MediaItem } from '@/lib/types';
import { Glyph } from '@/components/icons';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './shared';

const REVIEW_TONE: Record<string, string> = {
  pending: 'bg-gold-100 text-gold-800 border-gold-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function MyUploads() {
  const { data, loading, error, reload } = useApi<{ items: MediaItem[]; total: number }>(`/media/mine?pageSize=48`, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const items = data?.items || [];

  async function remove(id: string) {
    setBusyId(id); setMsg('');
    try {
      await apiDelete(`/media/${id}`);
      setMsg('已移入回收站');
      reload();
    } catch (e: any) {
      setMsg(e?.message || '删除失败');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有上传任何文件" action={{ label: '去上传', href: '/upload' }} />;

  return (
    <div>
      {msg ? <div role="status" className="mb-4 text-sm text-primary-700 bg-primary-50 border border-primary-200 rounded-xl px-4 py-2">{msg}</div> : null}
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((m) => (
          <div key={m.id} className="bg-white card-tech rounded-2xl p-4 border border-ink-100 flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-ink-100 flex items-center justify-center overflow-hidden flex-shrink-0 text-ink-400">
              {m.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" src={m.url} alt={m.title} className="w-full h-full object-cover"  decoding="async" />
              ) : (
                <Glyph
                  glyph={m.kind === 'audio' ? '🎵' : m.kind === 'video' ? '🎬' : m.kind === 'score' ? '🎼' : '📄'}
                  className="w-8 h-8"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-ink-900 truncate">{m.title}</h3>
                <span className={`px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${REVIEW_TONE[m.reviewStatus] || 'bg-ink-100 text-ink-600 border-ink-200'}`}>
                  {contentStatusLabel(m.reviewStatus)}
                </span>
              </div>
              <div className="text-xs text-ink-400 mt-1">{m.kindLabel} · <span className="num">{formatSize(m.sizeBytes)}</span> · {formatDate(m.createdAt)}</div>
              {m.reviewStatus === 'rejected' && m.reviewReason ? (
                <div className="text-xs text-rose-700 mt-1">驳回原因：{m.reviewReason}</div>
              ) : null}
              {/* 行内操作统一成后台那套 chip：裸文字链在手机上按不准 */}
              <div className="flex items-center gap-2 mt-2.5">
                {m.reviewStatus === 'approved' ? <Link href="/media" className="btn-chip btn-chip-safe">已在媒体库展示</Link> : null}
                <a href={m.url} download={m.fileName} className="btn-chip">下载</a>
                <button onClick={() => remove(m.id)} disabled={busyId === m.id} className="btn-chip btn-chip-danger disabled:opacity-50">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
