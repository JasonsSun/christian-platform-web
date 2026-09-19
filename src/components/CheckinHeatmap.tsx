'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface HeatDay {
  date: string;
  active: boolean;
}
interface HeatmapView {
  days: HeatDay[];
  yearDays: HeatDay[];
  streak: number;
  longestStreak: number;
  totalDays: number;
  yearActive: number;
  noteCount: number;
}

function StatV({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl bg-ui-surface px-3 py-2">
      <div className="text-xl font-bold text-ink-900">
        {value}
        <span className="text-xs font-normal text-ink-400 ml-0.5">{unit}</span>
      </div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function CheckinHeatmap() {
  const [data, setData] = useState<HeatmapView | null>(null);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet<HeatmapView>('/me/checkin-heatmap')
      .then((j) => {
        if (alive && j) setData(j);
      })
      .catch((e: any) => {
        // 401 说明确实没登录(api.ts 已尝试静默刷新仍失败), 其余错误静默忽略
        if (alive && e?.status === 401) setNeedLogin(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (needLogin) return null;
  if (loading) {
    return (
      <div className="glass rounded-2xl p-5 shadow-card border border-white/40">
        <div className="h-40 animate-pulse rounded-xl bg-white/50" />
      </div>
    );
  }
  if (!data) return null;

  const { days, streak, longestStreak, totalDays, yearActive, noteCount } = data;

  // 一年热力图网格：按周分列（每列 7 行，周日起始）
  const firstDow = new Date(`${days[0].date}T00:00:00`).getDay();
  const cells: (HeatDay | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const badges = [
    { label: '连续 7 天', got: streak >= 7 },
    { label: '连续 30 天', got: streak >= 30 },
    { label: '连续 100 天', got: streak >= 100 },
    { label: '连续 365 天', got: streak >= 365 },
    { label: '累计 100 天', got: totalDays >= 100 },
    { label: '累计 365 天', got: totalDays >= 365 },
    { label: '首条笔记', got: noteCount > 0 },
    { label: '笔记 50 条', got: noteCount >= 50 },
  ];

  return (
    <div className="glass rounded-2xl p-5 shadow-card border border-white/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold text-ink-900">读经打卡</h3>
        <span className="text-xs text-ink-400">过去一年</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatV label="当前连续" value={streak} unit="天" />
        <StatV label="最长连续" value={longestStreak} unit="天" />
        <StatV label="累计天数" value={totalDays} unit="天" />
        <StatV label="本年打卡" value={yearActive} unit="天" />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, di) => {
                const c = w[di];
                return (
                  <div
                    key={di}
                    title={c ? `${c.date}${c.active ? ' · 已打卡' : ''}` : ''}
                    className={`w-2.5 h-2.5 rounded-sm ${c ? (c.active ? 'bg-gold-400' : 'bg-ink-100') : 'bg-transparent'}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {badges.map((b) => (
          <span
            key={b.label}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              b.got ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-ink-950 shadow-gold' : 'bg-ink-100 text-ink-400'
            }`}
          >
            {b.got ? '🏅' : '🔒'} {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
