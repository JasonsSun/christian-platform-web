'use client';

import { formatSize } from '@/lib/format';

export interface QuotaData {
  level: number;
  levelName: string;
  trustScore: number;
  policy: {
    level: number; name: string; minScore: number;
    maxVideoMb: number; maxAudioMb: number; maxImageMb: number; maxDocMb: number;
    maxVideoSeconds: number; maxAudioSeconds: number;
    dailyUploads: number; dailyBytes: number; totalBytes: number;
  };
  next?: { level: number; name: string; minScore: number; gap: number; gains: string } | null;
  usage: {
    todayCount: number; todayBytes: number; totalBytes: number;
    dailyBytesLimit: number; totalBytesLimit: number; remainingTotal: number;
  };
  limits: { image: number; audio: number; video: number; doc: number; videoSeconds: number; audioSeconds: number };
  profile?: any;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) {
    const m = Math.round(s / 60);
    const rest = s % 60;
    return rest ? `${Math.floor(s / 60)} 分 ${rest} 秒` : `${m} 分钟`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function Bar({ value, max, tone = 'primary', label }: { value: number; max: number; tone?: 'primary' | 'gold'; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = tone === 'gold' ? 'bg-gold-500' : pct > 85 ? 'bg-rose-500' : 'bg-primary-600';
  return (
    <div
      className="h-2 rounded-full bg-ink-100 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const LEVEL_COLORS = ['bg-ink-100 text-ink-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-primary-100 text-primary-700', 'bg-gold-100 text-gold-800', 'bg-purple-100 text-purple-700'];

export default function QuotaCard({ data, compact = false }: { data: QuotaData; compact?: boolean }) {
  if (!data) return null;
  const p = data.policy;
  const next = data.next;
  const scorePct = next ? Math.min(100, Math.round((data.trustScore / Math.max(1, next.minScore)) * 100)) : 100;

  return (
    <div className="glass rounded-2xl p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${LEVEL_COLORS[data.level] || LEVEL_COLORS[0]}`}>
              L{data.level} · {data.levelName}
            </span>
            <span className="text-sm text-ink-500">信任分 {data.trustScore}</span>
          </div>
          <div className="text-xs text-ink-400 mt-1.5">
            上传额度随「在线时长 / 使用次数 / 内容贡献」自动提升
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-500">今日上传</div>
          <div className="text-lg font-semibold text-ink-900">
            {data.usage.todayCount}<span className="text-ink-400 text-sm">/{p.dailyUploads}</span>
          </div>
        </div>
      </div>

      {next ? (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-ink-500 mb-1">
            <span>距「{next.name}」还需 {next.gap} 分</span>
            <span>{scorePct}%</span>
          </div>
          <Bar value={data.trustScore} max={next.minScore} tone="gold" label="信任分升级进度" />
          <div className="text-xs text-gold-700 mt-1.5">升级后:{next.gains}</div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-gold-700">已达最高等级,享有全部上传权益</div>
      )}

      {!compact ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <LimitBox title="视频" main={`≤ ${fmtDuration(p.maxVideoSeconds)}`} sub={`单个 ≤ ${p.maxVideoMb}MB`} />
            <LimitBox title="音乐" main={`≤ ${fmtDuration(p.maxAudioSeconds)}`} sub={`单个 ≤ ${p.maxAudioMb}MB`} />
            <LimitBox title="图片" main={`≤ ${p.maxImageMb}MB`} sub="JPG/PNG/WEBP" />
            <LimitBox title="资料" main={`≤ ${p.maxDocMb}MB`} sub="PDF/Word/PPT" />
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <div className="flex justify-between text-xs text-ink-500 mb-1">
                <span>存储空间</span>
                <span>{formatSize(data.usage.totalBytes)} / {formatSize(p.totalBytes)}</span>
              </div>
              <Bar value={data.usage.totalBytes} max={p.totalBytes} label="存储空间使用率" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-ink-500 mb-1">
                <span>今日流量</span>
                <span>{formatSize(data.usage.todayBytes)} / {formatSize(p.dailyBytes)}</span>
              </div>
              <Bar value={data.usage.todayBytes} max={p.dailyBytes} label="今日流量使用率" />
            </div>
          </div>

          {data.profile ? (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Stat label="在线时长" value={`${Math.floor((data.profile.onlineSeconds || 0) / 60)} 分钟`} />
              <Stat label="使用次数" value={`${data.profile.actionCount || 0} 次`} />
              <Stat label="活跃天数" value={`${data.profile.activeDays || 0} 天`} />
              <Stat label="通过媒体" value={`${data.profile.approvedMediaCount || 0} 个`} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LimitBox({ title, main, sub }: { title: string; main: string; sub: string }) {
  return (
    <div className="rounded-xl bg-ui-surface border border-ui-border px-3 py-2.5">
      <div className="text-xs text-ui-muted">{title}</div>
      <div className="text-sm font-semibold text-ui-text mt-0.5">{main}</div>
      <div className="text-[11px] text-ui-muted mt-0.5">{sub}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-2 py-2">
      <div className="text-sm font-semibold text-ink-900">{value}</div>
      <div className="text-[11px] text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}
