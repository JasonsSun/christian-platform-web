import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { currentUser, UserRow } from '@/server/auth';
import { reminderMapFor, LEAD_OPTIONS } from '@/server/activityReminders';

export const dynamic = 'force-dynamic';

/**
 * 日历视图数据源：把「活动 + 我的读经打卡 + 我的读经计划进度」按天聚合到一个月份里。
 *
 * 未登录也能用（只有活动）；登录后额外带自己的打卡与读经完成记录。
 * 日期一律在 SQL 里用 DATE_FORMAT 转成 'YYYY-MM-DD' 字符串，
 * 不让 MySQL 的 DATE/DATETIME 列变成 JS Date（会变成 ISO 串，时区容易错位）。
 */

const pad = (n: number) => String(n).padStart(2, '0');

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 下月第 0 天 = 本月最后一天
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    days: Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`),
    from: `${month}-01`,
    to: `${nextY}-${pad(nextM)}-01`,
  };
}

/** GET /api/v1/calendar?month=YYYY-MM */
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const raw = (sp.get('month') || '').trim();
  const now = new Date();
  const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : cur;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '月份格式应为 YYYY-MM');
  }

  const viewer = (await currentUser(req)) as UserRow | null;
  const { days, from, to } = monthRange(month);

  const acts = await q<{
    id: string;
    title: string;
    category: string;
    location: string;
    cover: string;
    start_date: string;
    start_time: string;
    end_time: string | null;
  }>(
    `SELECT id, title, category, location, cover,
            DATE_FORMAT(start_at, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(start_at, '%H:%i')    AS start_time,
            DATE_FORMAT(end_at,   '%H:%i')    AS end_time
     FROM activities
     WHERE status = 'published' AND start_at >= ? AND start_at < ?
     ORDER BY start_at ASC`,
    [`${from} 00:00:00`, `${to} 00:00:00`]
  );

  const actMap = new Map<string, any[]>();
  for (const a of acts) {
    const key = String(a.start_date);
    const list = actMap.get(key) || [];
    list.push({
      id: String(a.id),
      title: String(a.title),
      category: String(a.category || 'fellowship'),
      location: String(a.location || ''),
      cover: String(a.cover || ''),
      date: key,
      startTime: String(a.start_time || ''),
      endTime: a.end_time ? String(a.end_time) : null,
    });
    actMap.set(key, list);
  }

  const checkedIn = new Set<string>();
  const planMap = new Map<string, { planId: string; day: number }[]>();
  if (viewer) {
    const ck = await q<{ d: string }>(
      `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d FROM user_daily_checkins
       WHERE user_id = ? AND day >= ? AND day < ?`,
      [viewer.id, from, to]
    );
    for (const r of ck) checkedIn.add(String(r.d));

    const pg = await q<{ d: string; plan_id: string; day: number }>(
      `SELECT DATE_FORMAT(done_at, '%Y-%m-%d') AS d, plan_id, day
       FROM reading_plan_progress
       WHERE user_id = ? AND done_at >= ? AND done_at < ?
       ORDER BY done_at ASC`,
      [viewer.id, `${from} 00:00:00`, `${to} 00:00:00`]
    );
    for (const r of pg) {
      const key = String(r.d);
      const list = planMap.get(key) || [];
      list.push({ planId: String(r.plan_id), day: Number(r.day) || 0 });
      planMap.set(key, list);
    }
  }

  const items = days.map((date) => {
    const activities = actMap.get(date) || [];
    const plans = planMap.get(date) || [];
    return {
      date,
      activities,
      checkedIn: checkedIn.has(date),
      plans,
      count: activities.length + plans.length + (checkedIn.has(date) ? 1 : 0),
    };
  });

  return ok({
    month,
    from,
    to,
    loggedIn: !!viewer,
    days: items,
    // 我对本月活动的提醒设置：activityId -> { leadMinutes, notifyAt, sent }
    reminders: viewer ? await reminderMapFor(viewer.id, acts.map((a) => String(a.id))) : {},
    leadOptions: LEAD_OPTIONS,
    summary: {
      activities: acts.length,
      checkins: checkedIn.size,
      planDays: Array.from(planMap.values()).reduce((s, v) => s + v.length, 0),
      activeDays: items.filter((d) => d.count > 0).length,
    },
  });
});
