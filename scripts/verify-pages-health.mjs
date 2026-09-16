// 全站页面 / GET 接口健康扫描：找出空白页、报错页、React 运行时错误(hook 顺序 #310 / 水合 #418)。
// 运行: BASE=http://127.0.0.1:3998 node scripts/verify-pages-health.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-audit-' + Date.now();
const DPORT = 9700 + (Date.now() % 200);

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const b64 = (s) => Buffer.from(s).toString('base64url');
const signJwt = (payload, secret) => {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => (await fetch(url)).text();

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const pick = async (sql) => { try { const [r] = await conn.query(sql); return r[0]?.id || ''; } catch { return ''; } };
const ids = {
  content: await pick("SELECT id FROM contents WHERE status='published' LIMIT 1"),
  group: await pick('SELECT id FROM groups LIMIT 1'),
  activity: await pick('SELECT id FROM activities LIMIT 1'),
  song: await pick('SELECT id FROM songs LIMIT 1'),
  sermon: await pick('SELECT id FROM sermons LIMIT 1'),
  media: await pick('SELECT id FROM media_files LIMIT 1'),
  user: await pick("SELECT id FROM users WHERE status='active' LIMIT 1"),
  live: await pick('SELECT id FROM live_rooms LIMIT 1'),
  plan: await pick('SELECT id FROM reading_plans LIMIT 1') || await pick('SELECT id FROM reading_plan_enrollment LIMIT 1'),
  collection: await pick('SELECT id FROM song_collections LIMIT 1'),
  series: await pick('SELECT id FROM sermon_series LIMIT 1'),
};
const [[admin]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='admin' ORDER BY created_at LIMIT 1"
);
await conn.end();
console.log('样本 id:', JSON.stringify(ids));

const TOKEN = signJwt(
  { sub: admin.id, role: admin.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 3600 },
  env.JWT_SECRET
);

const PAGES = [
  '/', '/bible', '/bible/cuv', '/bible/notes', '/bible/history',
  '/songs', '/songs/collections', '/community', '/community/create', '/feed',
  '/nearby', '/activities', '/activities/new', '/groups', '/friends',
  '/messages', '/notifications', '/prayers', '/plans', '/devotions',
  '/media', '/upload', '/sermons', '/donate', '/donate/new', '/donate/transparency',
  '/search', '/feedback', '/me', '/settings/notifications', '/settings/sessions', '/settings/two-factor',
  '/admin', '/admin/activities', '/admin/audit', '/admin/bible', '/admin/checkins',
  '/admin/comments', '/admin/contents', '/admin/donations', '/admin/events', '/admin/expenses', '/admin/feedback',
  '/admin/groups', '/admin/live', '/admin/media', '/admin/messages', '/admin/notifications',
  '/admin/organizations', '/admin/payments', '/admin/prayers', '/admin/quotas',
  '/admin/reports', '/admin/reviews', '/admin/roles', '/admin/sermons',
  '/admin/settings', '/admin/songs', '/admin/system', '/admin/tags', '/admin/users',
];
if (ids.content) PAGES.push(`/contents/${ids.content}`);
if (ids.group) PAGES.push(`/groups/${ids.group}`);
if (ids.activity) { PAGES.push(`/activities/${ids.activity}`); }
if (ids.song) { PAGES.push(`/songs/${ids.song}`, `/songs/${ids.song}/present`); }
if (ids.collection) PAGES.push(`/songs/collections/${ids.collection}`);
if (ids.sermon) PAGES.push(`/sermons/${ids.sermon}`);
if (ids.media) PAGES.push(`/media/${ids.media}`);
if (ids.user) PAGES.push(`/users/${ids.user}`);
if (ids.live) PAGES.push(`/live/${ids.live}`);
if (ids.plan) PAGES.push(`/plans/${ids.plan}`);

const GET_APIS = [
  '/api/v1/health', '/api/v1/home', '/api/v1/bible', '/api/v1/bible/bookmarks',
  '/api/v1/bible/history', '/api/v1/bible/plan', '/api/v1/songs', '/api/v1/songs/favorites',
  '/api/v1/sermons', '/api/v1/sermon-series', '/api/v1/contents', '/api/v1/feed',
  '/api/v1/groups', '/api/v1/friends', '/api/v1/friends/requests', '/api/v1/messages',
  '/api/v1/notifications', '/api/v1/prayers', '/api/v1/plans', '/api/v1/activities',
  '/api/v1/media', '/api/v1/media/mine', '/api/v1/live', '/api/v1/live/recordings',
  '/api/v1/donations', '/api/v1/search?q=神', '/api/v1/settings/public',
  '/api/v1/me', '/api/v1/me/favorites', '/api/v1/me/growth', '/api/v1/me/quota',
  '/api/v1/me/sessions', '/api/v1/me/notification-prefs', '/api/v1/me/devotionals',
  '/api/v1/me/checkin-heatmap', '/api/v1/me/export', '/api/v1/me/activity',
  '/api/v1/payments/gateways', '/api/v1/moderation/queue', '/api/v1/moderation/team',
  '/api/v1/admin/stats', '/api/v1/admin/users', '/api/v1/admin/settings',
  '/api/v1/admin/payments', '/api/v1/admin/audit', '/api/v1/admin/events',
  '/api/v1/admin/roles', '/api/v1/admin/quotas', '/api/v1/admin/quotas/policy',
  '/api/v1/admin/notification-templates', '/api/v1/admin/organizations',
  '/api/v1/admin/groups', '/api/v1/admin/songs', '/api/v1/admin/media',
  '/api/v1/admin/activities', '/api/v1/admin/checkins', '/api/v1/admin/donations',
  '/api/v1/admin/expenses', '/api/v1/admin/feedback', '/api/v1/admin/prayers',
  '/api/v1/admin/reports', '/api/v1/admin/notifications', '/api/v1/admin/sermons',
  '/api/v1/admin/bible', '/api/v1/admin/live', '/api/v1/monitor',
];

/* ---------------- API 扫描（fetch，快） ---------------- */
console.log('\n===== API 扫描 =====');
const apiBad = [];
for (const p of GET_APIS) {
  let code = 0, body = '', err = '';
  try {
    const r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${TOKEN}` } });
    code = r.status; body = (await r.text()).slice(0, 200);
  } catch (e) { err = String(e.message || e); }
  const bad = err || code >= 400;
  if (bad) {
    apiBad.push({ p, code, err, body });
    console.log(`  \u2717 ${p} -> ${code || err} ${body.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}
console.log(`API: ${GET_APIS.length - apiBad.length}/${GET_APIS.length} 正常`);

/* ---------------- 页面扫描（Chrome CDP） ---------------- */
console.log('\n===== 页面扫描 =====');
fs.mkdirSync(UDD, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--no-proxy-server', '--proxy-bypass-list=*',
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = {};
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending[m.id]) { this.pending[m.id](m); delete this.pending[m.id]; } };
  }
  send(method, params = {}) {
    return new Promise((res) => { const id = ++this.id; this.pending[id] = res; this.ws.send(JSON.stringify({ id, method, params })); });
  }
}
let ver = null;
for (let i = 0; i < 40 && !ver; i++) {
  try { ver = JSON.parse(await get(`http://127.0.0.1:${DPORT}/json/version`)); } catch { await sleep(300); }
}
if (!ver) { console.log('Chrome 启动失败'); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
const cdp = new CDP(ws);
const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const raw = (method, params = {}) =>
  new Promise((res) => { const id = ++cdp.id; cdp.pending[id] = res; ws.send(JSON.stringify({ id, method, params, sessionId })); });
const evaluate = async (expr) => {
  const r = await raw('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.result?.value;
};
await raw('Page.enable');
await raw('Runtime.enable');
await raw('Log.enable');
await raw('Console.enable');
await raw('Network.enable');
await raw('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('platform_access_token', ${JSON.stringify(TOKEN)});localStorage.setItem('platform_refresh_token', ${JSON.stringify(TOKEN)});}catch(e){}`,
});

const pageBad = [];
for (const p of PAGES) {
  const errs = [];
  const onMsg = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') errs.push(String(m.params.entry.text || '').slice(0, 160));
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 160));
    // React 生产错误（#310 hook 顺序 / #418 水合 / #423 水合失败）只出现在 console，必须单独收
    if (m.method === 'Console.messageAdded' && m.params?.message?.level === 'error') {
      const t = String(m.params.message.text || '');
      if (/Minified React error|Warning:|hydrat/i.test(t)) errs.push('REACT ' + t.slice(0, 120));
    }
  };
  ws.addEventListener('message', onMsg);
  await raw('Page.navigate', { url: BASE + p });
  await sleep(2600);
  const info = await evaluate(`(() => {
    const b = document.body;
    const txt = (b?.innerText || '').replace(/\\s+/g,' ').trim();
    return { len: txt.length, sample: txt.slice(0,160), title: document.title };
  })()`);
  ws.removeEventListener('message', onMsg);
  const d = info || { len: 0, sample: '', title: '' };
  const suspicious =
    d.len < 40 ||
    /Application error|Something went wrong|Internal Server Error|模块已暂停/.test(d.sample) ||
    errs.length > 0;
  const flag = suspicious ? '\u2717' : '\u2713';
  if (suspicious) pageBad.push({ p, len: d.len, sample: d.sample, errs: errs.slice(0, 3) });
  console.log(`  ${flag} ${p} len=${d.len} err=${errs.length} ${d.sample.slice(0, 90)}`);
  if (errs.length) errs.slice(0, 3).forEach((e) => console.log(`       ! ${e.replace(/\s+/g, ' ')}`));
}
console.log(`\n页面: ${PAGES.length - pageBad.length}/${PAGES.length} 正常`);
console.log('\n===== 汇总 =====');
console.log('异常 API:', apiBad.map((x) => `${x.p}(${x.code || x.err})`).join(', ') || '无');
console.log('异常页面:', pageBad.map((x) => `${x.p}(len=${x.len},err=${x.errs.length})`).join(', ') || '无');
try { chrome.kill(); } catch {}
process.exit(0);
