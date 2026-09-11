'use client';

import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox } from '../_components';

interface BibleData {
  totals: { versions: number; books: number; verses: number };
  byVersion: { version: string; verseCount: number; bookCount: number; chapterCount: number }[];
  byBook: { bookId: string; version: string; verseCount: number; maxChapter: number; chapters: number[] }[];
  preview: { version: string; bookId: string; chapter: number; verse: number; text: string }[];
}

export default function AdminBiblePage() {
  const { data, loading, error, reload } = useApi<BibleData>('/admin/bible', []);
  const byBook = data?.byBook || [];

  return (
    <AdminLayout>
      <SectionTitle>圣经管理</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">版本、书卷、章节与经文收录情况</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="版本数" value={data?.totals.versions ?? '—'} />
        <StatCard title="书卷数" value={data?.totals.books ?? '—'} />
        <StatCard title="经文总数" value={data?.totals.verses ?? '—'} />
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">版本概览</div>
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">版本</th>
                  <th className="text-center px-4 py-3 font-medium">书卷</th>
                  <th className="text-center px-4 py-3 font-medium">章节</th>
                  <th className="text-center px-4 py-3 font-medium">经文</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byVersion || []).map((v) => (
                  <tr key={v.version} className="border-t border-ink-100">
                    <td className="px-4 py-3"><Badge tone="primary">{v.version.toUpperCase()}</Badge></td>
                    <td className="px-4 py-3 text-center">{v.bookCount}</td>
                    <td className="px-4 py-3 text-center">{v.chapterCount}</td>
                    <td className="px-4 py-3 text-center font-medium text-ink-900">{v.verseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">书卷清单</div>
            {byBook.length === 0 ? (
              <Empty label="暂无书卷" />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">书卷</th>
                    <th className="text-left px-4 py-3 font-medium">版本</th>
                    <th className="text-center px-4 py-3 font-medium">最大章</th>
                    <th className="text-center px-4 py-3 font-medium">经文数</th>
                  </tr>
                </thead>
                <tbody>
                  {byBook.map((b) => (
                    <tr key={`${b.version}-${b.bookId}`} className="border-t border-ink-100">
                      <td className="px-4 py-3 font-medium text-ink-900">{b.bookId}</td>
                      <td className="px-4 py-3 text-ink-600">{b.version}</td>
                      <td className="px-4 py-3 text-center text-ink-600">{b.maxChapter}</td>
                      <td className="px-4 py-3 text-center text-ink-700">{b.verseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass rounded-2xl p-4 shadow-soft">
            <div className="font-medium text-ink-700 mb-3">经文预览</div>
            <ul className="space-y-2 text-sm text-ink-600">
              {(data?.preview || []).map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary-600 font-medium whitespace-nowrap">
                    {p.version} {p.bookId} {p.chapter}:{p.verse}
                  </span>
                  <span className="line-clamp-1">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
