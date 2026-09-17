// 日历视图 e2e：按月份聚合活动 / 登录时叠加打卡与读经进度 / 日期不跨月 /
// 只统计已发布活动 / 未登录可用 / 月份格式校验 / 页面 SSR。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-calendar.mjs
import mysql from 'mysql2/promise';
import fs from 'fs';
import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const b64 = (s) => Buffer.from(s).toString('base64url');
const signJwt = (payload, secret) => {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

async function api(method, path, token) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const [users] = await conn.query("SELECT id FROM users WHERE status='active' AND role='member' LIMIT 1");
const ME = String(users[0].id);
const TOKEN = signJwt(
  { sub: ME, role: 'member', typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const MONTH = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const DAY = `${MONTH}-15`;
const PREV_DAY = (() => {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 20));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-20`;
})();

// 造一条本月活动 + 一条上月活动 + 一条取消状态活动
const A_IN = crypto.randomUUID();
const A_PREV = crypto.randomUUID();
const A_CANCEL = crypto.randomUUID();
await conn.query(
  `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, capacity, cover, status, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
  [A_IN, ME, 'e2e-本月活动', '日历 e2e', 'fellowship', '测试地点', '上海', `${DAY} 19:30:00`, 50, '📅', 'published']
);
await conn.query(
  `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, capacity, cover, status, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
  [A_PREV, ME, 'e2e-上月活动', '日历 e2e', 'fellowship', '', '', `${PREV_DAY} 10:00:00`, 50, '📅', 'published']
);
await conn.query(
  `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, capacity, cover, status, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
  [A_CANCEL, ME, 'e2e-取消活动', '日历 e2e', 'fellowship', '', '', `${DAY} 20:00:00`, 50, '📅', 'cancelled']
);
// 造一条当天打卡 + 一条读经进度
await conn.query('INSERT IGNORE INTO user_daily_checkins (user_id, day, streak, created_at) VALUES (?,?,1,NOW())', [ME, DAY]);
await conn.query(
  'INSERT IGNORE INTO reading_plan_progress (id, user_id, plan_id, day, done_at) VALUES (?,?,?,?,?)',
  [crypto.randomUUID(), ME, 'e2e-plan', 1, `${DAY} 08:00:00`]
);

const cleanup = async () => {
  await conn.query('DELETE FROM activities WHERE title LIKE ?', ['e2e-%']);
  await conn.query('DELETE FROM user_daily_checkins WHERE user_id = ? AND day = ?', [ME, DAY]);
  await conn.query('DELETE FROM reading_plan_progress WHERE user_id = ? AND plan_id = ?', [ME, 'e2e-plan']);
};

for (let i = 0; i < 40; i++) {
  const r = await api('GET', `/calendar?month=${MONTH}`);
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 聚会日历');

/* 1. 基础结构 */
{
  const r = await api('GET', `/calendar?month=${MONTH}`);
  check('日历接口返回 200', r.status === 200, `status=${r.status}`);
  check('month 回显正确', r.data?.month === MONTH, `month=${r.data?.month}`);
  const days = r.data?.days || [];
  check('返回当月每一天', days.length >= 28 && days.length <= 31, `len=${days.length}`);
  check('日期都在本月内', days.every((d) => d.date.startsWith(MONTH)));
  check('summary 字段齐全', ['activities', 'checkins', 'planDays', 'activeDays'].every((k) => typeof r.data?.summary?.[k] === 'number'));
}

/* 2. 活动聚合 */
{
  const r = await api('GET', `/calendar?month=${MONTH}`);
  const day = (r.data?.days || []).find((d) => d.date === DAY);
  const mine = (day?.activities || []).find((a) => a.id === A_IN);
  check('本月活动出现在对应日期', !!mine, JSON.stringify(day?.activities?.map((a) => a.title)));
  check('活动时间格式化为 HH:mm', mine?.startTime === '19:30', `time=${mine?.startTime}`);
  check('取消状态活动不进日历', !JSON.stringify(r.data).includes('e2e-取消活动'));

  const prevMonth = PREV_DAY.slice(0, 7);
  const rp = await api('GET', `/calendar?month=${prevMonth}`);
  check('上月活动出现在上月日历', JSON.stringify(rp.data?.days || []).includes('e2e-上月活动'));
  check('上月活动不串到本月', !JSON.stringify(r.data?.days || []).includes('e2e-上月活动'));
}

/* 3. 登录：打卡与读经 */
{
  const anon = await api('GET', `/calendar?month=${MONTH}`);
  const anonDay = (anon.data?.days || []).find((d) => d.date === DAY);
  check('未登录时 loggedIn=false', anon.data?.loggedIn === false);
  check('未登录时打卡标记为 false', anonDay?.checkedIn === false);

  const mine = await api('GET', `/calendar?month=${MONTH}`, TOKEN);
  const d = (mine.data?.days || []).find((x) => x.date === DAY);
  check('登录后 loggedIn=true', mine.data?.loggedIn === true);
  check('打卡日标记正确', d?.checkedIn === true);
  check('读经完成记到当天', (d?.plans || []).some((p) => p.planId === 'e2e-plan'), JSON.stringify(d?.plans));
  check('summary 打卡数 >=1', (mine.data?.summary?.checkins || 0) >= 1);
  check('summary 读经数 >=1', (mine.data?.summary?.planDays || 0) >= 1);
  check('summary 活动数 >=1', (mine.data?.summary?.activities || 0) >= 1);
}

/* 4. 参数校验与边界 */
{
  const bad = await api('GET', '/calendar?month=2026-13');
  check('非法月份返回 422', bad.status === 422, `status=${bad.status}`);
  const weird = await api('GET', '/calendar?month=abc');
  check('非月份格式回退到当月而非报错', weird.status === 200 && /^\d{4}-\d{2}$/.test(weird.data?.month || ''), `status=${weird.status}`);
  const feb = await api('GET', '/calendar?month=2024-02');
  check('闰年 2 月返回 29 天', (feb.data?.days || []).length === 29, `len=${(feb.data?.days || []).length}`);
  const feb2 = await api('GET', '/calendar?month=2026-02');
  check('平年 2 月返回 28 天', (feb2.data?.days || []).length === 28, `len=${(feb2.data?.days || []).length}`);
}

/* 5. 页面 SSR */
{
  const p = await fetch(BASE + '/calendar');
  const h = await p.text();
  check('/calendar 页面 200', p.status === 200, `status=${p.status}`);
  check('/calendar SSR 含「聚会日历」', h.includes('聚会日历'));
}

await cleanup();
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
