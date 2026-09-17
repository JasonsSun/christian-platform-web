// 活动提醒 e2e：订阅/改期/取消 / 每人每活动唯一 / 已开始与不存在活动的校验 /
// 日历接口回显提醒 / cron 到点发送且不重复 / ICS 订阅导出。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-activity-reminders.mjs
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

async function api(method, path, token, body) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(env.CRON_SECRET ? { 'x-cron-secret': env.CRON_SECRET } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, res };
}

const [[u]] = await conn.query("SELECT id FROM users WHERE status='active' AND role='member' LIMIT 1");
const ME = String(u.id);
const [[ad]] = await conn.query("SELECT id FROM users WHERE status='active' AND role='admin' LIMIT 1");
const ADMIN = String(ad?.id || ME);
const mk = (id, role) => signJwt({ sub: id, role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 }, env.JWT_SECRET);
const TOKEN = mk(ME, 'member');
const ADMIN_TOKEN = mk(ADMIN, 'admin');

const pad = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 10 * 86400_000); // 10 天后，肯定未开始
const DAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTH = DAY.slice(0, 7);
const NEXT_DAY = (() => {
  const t = new Date(Date.now() + 11 * 86400_000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
})();

const A_FUTURE = crypto.randomUUID();
const A_FUTURE2 = crypto.randomUUID();
const A_PAST = crypto.randomUUID();
const A_CANCEL = crypto.randomUUID();
// 先清历史残留（按标题，避免上次崩溃留下的活动/提醒干扰计数），再插本次数据。
// 表是运行时幂等建的，首次运行时它还不存在 —— 清库报错可忽略。
const cleanup = async () => {
  await conn
    .query("DELETE r FROM activity_reminders r JOIN activities a ON a.id = r.activity_id WHERE a.title LIKE 'e2e-提醒-%'")
    .catch(() => {});
  await conn.query("DELETE FROM activities WHERE title LIKE 'e2e-提醒-%'");
  await conn.query("DELETE FROM notifications WHERE type = 'activity.reminder'");
};
await cleanup();

const insAct = (id, title, start, status) =>
  conn.query(
    `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, capacity, cover, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [id, ME, title, '活动提醒 e2e', 'fellowship', '测试地点', '上海', start, 50, '📅', status]
  );
await insAct(A_FUTURE, 'e2e-提醒-未来活动', `${DAY} 19:30:00`, 'published');
await insAct(A_FUTURE2, 'e2e-提醒-未来活动二', `${NEXT_DAY} 09:00:00`, 'published');
await insAct(A_PAST, 'e2e-提醒-已开始', '2020-01-01 10:00:00', 'published');
await insAct(A_CANCEL, 'e2e-提醒-未发布', `${DAY} 20:00:00`, 'draft');

// 等按需编译
for (let i = 0; i < 40; i++) {
  const r = await api('GET', '/me/activity-reminders', TOKEN);
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 活动提醒');

/* 1. 鉴权 */
{
  const a = await api('GET', '/me/activity-reminders');
  check('未登录看提醒列表 401', a.status === 401, `status=${a.status}`);
  const b = await api('POST', '/me/activity-reminders', null, { activityId: A_FUTURE });
  check('未登录订阅提醒 401', b.status === 401, `status=${b.status}`);
}

/* 2. 订阅 */
{
  const r = await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_FUTURE, leadMinutes: 1440 });
  check('订阅返回 201', r.status === 201, `status=${r.status} ${JSON.stringify(r.data)}`);
  check('回显提前量', r.data?.item?.leadMinutes === 1440, `${r.data?.item?.leadMinutes}`);
  check('回显活动标题', r.data?.item?.title === 'e2e-提醒-未来活动', r.data?.item?.title);
  check('回显通知时刻', typeof r.data?.item?.notifyAt === 'string' && r.data.item.notifyAt.length > 0);
  check('初始未发送', r.data?.item?.sent === false);

  // 提前 1 天 => 通知时刻应为活动前一天同一钟点
  const expect = (() => {
    const t = new Date(d.getTime() - 86400_000);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} 19:30`;
  })();
  check('通知时刻 = 开始时间 - 提前量', r.data?.item?.notifyAt === expect, `${r.data?.item?.notifyAt} vs ${expect}`);
}

/* 3. 改期与唯一性 */
{
  await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_FUTURE, leadMinutes: 120 });
  const [rows] = await conn.query('SELECT COUNT(*) AS c, MAX(lead_minutes) AS lead_min FROM activity_reminders WHERE user_id=? AND activity_id=?', [ME, A_FUTURE]);
  check('重复订阅不产生新行', Number(rows[0].c) === 1, `count=${rows[0].c}`);
  check('重复订阅等于改提前量', Number(rows[0].lead_min) === 120, `lead=${rows[0].lead_min}`);

  await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_FUTURE2, leadMinutes: 30 });
  const list = await api('GET', '/me/activity-reminders', TOKEN);
  check('列表含两条订阅', (list.data?.items || []).length === 2, `len=${(list.data?.items || []).length}`);
  check('列表按活动开始时间升序', (list.data?.items || [])[0]?.activityId === A_FUTURE);
  check('列表返回可选提前量', Array.isArray(list.data?.leadOptions) && list.data.leadOptions.includes(4320));
}

/* 4. 校验 */
{
  const past = await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_PAST, leadMinutes: 1440 });
  check('已开始活动返回 422', past.status === 422, `status=${past.status}`);
  check('错误码 ACTIVITY_STARTED', past.data?.code === 'ACTIVITY_STARTED', past.data?.code);

  const none = await api('POST', '/me/activity-reminders', TOKEN, { activityId: crypto.randomUUID(), leadMinutes: 1440 });
  check('不存在的活动返回 404', none.status === 404, `status=${none.status}`);

  const draft = await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_CANCEL, leadMinutes: 1440 });
  check('未发布活动返回 422', draft.status === 422, `status=${draft.status}`);

  const noId = await api('POST', '/me/activity-reminders', TOKEN, { leadMinutes: 1440 });
  check('缺 activityId 返回 422', noId.status === 422, `status=${noId.status}`);

  // 非法提前量回落到默认 1 天，而不是写入脏值
  const weird = await api('POST', '/me/activity-reminders', TOKEN, { activityId: A_FUTURE2, leadMinutes: 99999 });
  check('非法提前量回落为默认 1440', weird.data?.item?.leadMinutes === 1440, `${weird.data?.item?.leadMinutes}`);
}

/* 5. 日历接口回显 */
{
  const cal = await api('GET', `/calendar?month=${MONTH}`, TOKEN);
  check('日历接口 200', cal.status === 200);
  check('reminders 回显该活动', !!cal.data?.reminders?.[A_FUTURE], JSON.stringify(cal.data?.reminders));
  check('reminders 带提前量', cal.data?.reminders?.[A_FUTURE]?.leadMinutes === 120, `${cal.data?.reminders?.[A_FUTURE]?.leadMinutes}`);
  check('leadOptions 一并下发', Array.isArray(cal.data?.leadOptions));
  const anon = await api('GET', `/calendar?month=${MONTH}`);
  check('未登录时 reminders 为空对象', Object.keys(anon.data?.reminders || {}).length === 0);
}

/* 6. 取消 */
{
  const r = await api('DELETE', `/me/activity-reminders?activityId=${A_FUTURE2}`, TOKEN);
  check('取消返回 200', r.status === 200, `status=${r.status}`);
  check('removed=true', r.data?.removed === true);
  const list = await api('GET', '/me/activity-reminders', TOKEN);
  check('取消后列表只剩 1 条', (list.data?.items || []).length === 1, `len=${(list.data?.items || []).length}`);
  const again = await api('DELETE', `/me/activity-reminders?activityId=${A_FUTURE2}`, TOKEN);
  check('重复取消不报错（幂等）', again.status === 200 && again.data?.removed === false);
  const noId = await api('DELETE', '/me/activity-reminders', TOKEN);
  check('取消缺 activityId 返回 422', noId.status === 422, `status=${noId.status}`);
}

/* 7. cron 发送 + 幂等 */
{
  // 把通知时刻改成过去，模拟「到点了」
  await conn.query('UPDATE activity_reminders SET notify_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE), sent_at = NULL WHERE user_id=? AND activity_id=?', [ME, A_FUTURE]);
  await conn.query("DELETE FROM notifications WHERE type='activity.reminder'");

  const run = await api('POST', '/cron/activity-reminders', ADMIN_TOKEN, { dispatchJobs: false });
  check('cron 接口 200', run.status === 200, `status=${run.status} ${JSON.stringify(run.data)}`);
  check('扫描到 1 条待发提醒', run.data?.reminders?.scanned === 1, `scanned=${run.data?.reminders?.scanned}`);
  check('成功发送 1 条', run.data?.reminders?.sent === 1, `sent=${run.data?.reminders?.sent}`);

  const [ntf] = await conn.query("SELECT user_id, title, body, link FROM notifications WHERE type='activity.reminder'");
  check('生成 activity.reminder 通知', ntf.length === 1, `count=${ntf.length}`);
  check('通知发给订阅者', String(ntf[0]?.user_id) === ME);
  check('通知正文含活动标题', String(ntf[0]?.body || '').includes('e2e-提醒-未来活动'), ntf[0]?.body);
  check('通知链接指向活动详情', String(ntf[0]?.link || '').includes(A_FUTURE));

  const [rows] = await conn.query('SELECT sent_at FROM activity_reminders WHERE user_id=? AND activity_id=?', [ME, A_FUTURE]);
  check('发送后标记 sent_at', !!rows[0]?.sent_at);

  const again = await api('POST', '/cron/activity-reminders', ADMIN_TOKEN, { dispatchJobs: false });
  check('再次 cron 不重复发送', again.data?.reminders?.scanned === 0, `scanned=${again.data?.reminders?.scanned}`);
  const [ntf2] = await conn.query("SELECT COUNT(*) AS c FROM notifications WHERE type='activity.reminder'");
  check('通知没有重复堆积', Number(ntf2[0].c) === 1, `count=${ntf2[0].c}`);
}

/* 8. ICS 订阅 */
{
  const r = await fetch(BASE + '/api/v1/calendar/ics');
  const text = await r.text();
  check('ICS 接口 200', r.status === 200, `status=${r.status}`);
  check('Content-Type 为 text/calendar', (r.headers.get('content-type') || '').includes('text/calendar'), r.headers.get('content-type'));
  check('未登录也能订阅（公开）', r.status === 200);
  check('含 VCALENDAR 头尾', text.includes('BEGIN:VCALENDAR') && text.trimEnd().endsWith('END:VCALENDAR'));
  check('含未来活动', text.includes('e2e-提醒-未来活动'));
  check('含 VALARM 提醒', text.includes('BEGIN:VALARM') && text.includes('TRIGGER:-PT1H'));
  check('不含已取消/未发布活动', !text.includes('e2e-提醒-未发布'));
  check('不含已过期活动', !text.includes('e2e-提醒-已开始'));
  const dt = /DTSTART:(\d{8}T\d{6})/.exec(text);
  check('DTSTART 为浮动本地时间（不带 Z）', !!dt && !dt[1].endsWith('Z'), dt?.[1]);
  check('行尾为 CRLF', text.includes('\r\n'));
}

/* 9. 页面 SSR */
{
  const p = await fetch(BASE + '/calendar');
  const h = await p.text();
  check('/calendar 页面 200', p.status === 200, `status=${p.status}`);
  check('日历页含订阅入口', h.includes('订阅日历'));
}

await cleanup();
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
