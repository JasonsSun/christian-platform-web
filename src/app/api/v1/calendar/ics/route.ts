import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { withApi, num } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * 日历订阅（ICS 导出）。
 *
 * 把「已发布且未结束」的活动导出成标准 iCalendar，用户可直接订阅到系统日历
 * （Apple/Google/Outlook 都支持 URL 订阅），这样即使不上站也能收到活动提醒 ——
 * 平台自己的提醒只有登录用户在线才拿得到，这是它的互补面。
 *
 * 时间一律按「本地浮动时间」写（不带 Z / 不带 TZID）：站点的活动时间是用户所在
 * 当地的活动时间，强转成 UTC 会让跨时区订阅者看到错误钟点。
 * 每个事件自带 1 小时前的 VALARM，订阅端无需额外配置就有提醒。
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm:ss' -> 'YYYYMMDDTHHMMSS'（浮动时间） */
function toFloating(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v || ''));
  if (!m) return '';
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`;
}

function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** ICS 文本转义 + 75 字节折行（RFC 5545） */
function esc(v: string): string {
  return String(v || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(' ' + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

/** GET /api/v1/calendar/ics?months=12 */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const months = Math.min(Math.max(num(sp.get('months'), 12), 1), 36);

  const rows = await q<{
    id: string;
    title: string;
    description: string;
    location: string;
    start_at: string;
    end_at: string | null;
    category: string;
  }>(
    `SELECT id, title, description, location, category,
            DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(end_at,   '%Y-%m-%d %H:%i:%s') AS end_at
     FROM activities
     WHERE status = 'published'
       AND start_at >= NOW()
       AND start_at <= DATE_ADD(NOW(), INTERVAL ? MONTH)
     ORDER BY start_at ASC
     LIMIT 500`,
    [months]
  );

  const stamp = toUtcStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amen Community//Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:圣约社区 · 聚会日历',
    'X-WR-TIMEZONE:Asia/Shanghai',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
  ];

  for (const a of rows) {
    const dtStart = toFloating(String(a.start_at));
    if (!dtStart) continue;
    const dtEnd = toFloating(String(a.end_at || '')) || dtStart;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${String(a.id)}@amen-community`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      fold(`SUMMARY:${esc(a.title)}`),
      fold(`LOCATION:${esc(a.location || '')}`),
      fold(`DESCRIPTION:${esc((a.description || '').slice(0, 500))}`),
      `CATEGORIES:${esc(a.category || 'fellowship')}`,
      `URL:${process.env.NEXT_PUBLIC_SITE_URL || ''}/activities/${a.id}`,
      // 自带 1 小时前的提醒：订阅端无需再配置
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:活动即将开始',
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="amen-activities.ics"',
      'Cache-Control': 'public, max-age=600',
    },
  });
});
