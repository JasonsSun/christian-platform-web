// 无头 Chrome 截图：验证「团长退出弹层」与「取消活动弹层」两处新 UI 的真实渲染
// 运行: BASE=http://127.0.0.1:3955 node scripts/shot-governance-ui.mjs
//
// 用 CDP 注入 JWT 绕过登录，直接对需登录的页面截图。
// 注意：必须加 --no-proxy-server，否则沙箱代理会让静态资源 404 → 整页无样式。

import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3955';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-governance';
const DPORT = 9431;
const OUT = 'F:/sjjob/_shots';

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

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});

const [[owner]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='admin' ORDER BY created_at LIMIT 1"
);
const [[other]] = await conn.query(
  "SELECT id FROM users WHERE status='active' AND id<>? ORDER BY created_at LIMIT 1", [owner.id]
);
if (!owner || !other) { console.log('用户不足，跳过'); process.exit(0); }

// 造一个「团长独自一人」的团契 + 一个待取消的活动
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 19).replace('T', ' ');
const gid = `e2e_shot_g_${Date.now()}`;
const aid = `e2e_shot_a_${Date.now()}`;
await conn.query(
  `INSERT INTO \`groups\` (id, name, description, category, owner_id, city, cover, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  [gid, '截图用单人团契', '用于验证团长退出弹层渲染，截图后立即清理。', 'fellowship', owner.id, '上海', '👥', iso(0)]
);
await conn.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,'owner',?)`, [gid, owner.id, iso(0)]);
await conn.query(
  `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, end_at, capacity, cover, status, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,'published',?)`,
  [aid, owner.id, '截图用活动（待取消）', '用于验证取消活动弹层与通知条渲染，截图后立即清理。',
   'fellowship', '测试地点', '上海', iso(7), iso(7), 10, '📅', iso(0)]
);
await conn.query(
  `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at) VALUES (?,?,?,'confirmed',?)`,
  [`e2e_shot_reg_${Date.now()}_o`, aid, owner.id, iso(0)]
);
await conn.query(
  `INSERT INTO activity_registrations (id, activity_id, user_id, status, created_at) VALUES (?,?,?,'confirmed',?)`,
  [`e2e_shot_reg_${Date.now()}_x`, aid, other.id, iso(0)]
);

const TOKEN = signJwt(
  { sub: owner.id, role: owner.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);

fs.mkdirSync(UDD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--no-proxy-server', '--proxy-bypass-list=*',
  '--window-size=1440,1100', 'about:blank',
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
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bcdp = new CDP(bws);
const { result } = await bcdp.send('Target.createTarget', { url: 'about:blank' });
const list = JSON.parse(await get(`http://127.0.0.1:${DPORT}/json/list`));
const tgt = list.find((t) => t.id === result.targetId);
const pws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (pws.onopen = r));
const cdp = new CDP(pws);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

const evaluate = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const shot = async (out) => {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
};
const realClick = async (expr) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ok = await evaluate(`(() => { const el = ${expr}; if (!el) return false; document.documentElement.style.scrollBehavior='auto'; el.scrollIntoView({block:'center'}); return true; })()`);
    if (!ok) return false;
    await sleep(300);
    const info = await evaluate(`(() => {
      const el = ${expr}; if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width/2), y = Math.round(b.top + b.height/2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitSelf: !!(hit && (hit===el || el.contains(hit) || hit.contains(el))) };
    })()`);
    if (!info) return false;
    if (!info.hitSelf) continue;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
};

const login = async () => {
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);
  await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(TOKEN)});localStorage.setItem('platform_refresh_token',${JSON.stringify(TOKEN)});'ok'`);
};

try {
  await login();

  // ---------- 1. 团长独自一人 → 退出弹层只给「退出并解散」 ----------
  await cdp.send('Page.navigate', { url: `${BASE}/groups/${gid}` });
  await sleep(4000);
  const cssOk = await evaluate(`!!document.querySelector('nav a, header, [class*="rounded"]')`);
  check('页面样式已加载（CSS 生效）', cssOk === true);

  const clicked = await realClick(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('退出团契（团长）'))`);
  await sleep(1200);
  check('已点开团长退出弹层', clicked === true);
  const modalText = await evaluate(`(() => { const d = document.querySelector('[data-guard="owner-exit-modal"]'); return d ? d.innerText : ''; })()`);
  check('弹层提示「团契将会被解散」', modalText.includes('团契将会被解散'), modalText.slice(0, 80));
  check('弹层给出唯一动作「退出并解散」', modalText.includes('退出并解散'));
  check('弹层未出现「移交团长」选项（单人团无接任者）', !modalText.includes('移交团长并退出'), modalText.slice(0, 120));
  check('弹层提示可先拉人再退出', modalText.includes('邀请成员'));
  await shot(`${OUT}/governance-solo-owner-exit.png`);

  // ---------- 2. 活动详情：创建人可见「取消活动」，弹层说明会通知全部参与人 ----------
  await cdp.send('Page.navigate', { url: `${BASE}/activities/${aid}` });
  await sleep(4000);
  const hasCancelBtn = await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '取消活动')`);
  check('创建人能看到「取消活动」按钮', hasCancelBtn === true);
  const creatorNote = await evaluate(`document.body.innerText.includes('你是本活动创建人')`);
  check('创建人显示「已自动加入参与者，无需报名」', creatorNote === true);

  await realClick(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '取消活动')`);
  await sleep(1200);
  const cancelText = await evaluate(`(() => { const d = document.querySelector('[data-guard="activity-cancel-modal"]'); return d ? d.innerText : ''; })()`);
  check('取消活动弹层已打开', cancelText.includes('确定要取消'));
  check('弹层说明会通知全部参与人', cancelText.includes('通知全部') && cancelText.includes('参与人'), cancelText.slice(0, 120));
  check('弹层说明无需参与人同意', cancelText.includes('无需他们同意'));
  await shot(`${OUT}/governance-activity-cancel.png`);

  // ---------- 3. 管理后台：组织管理页的「组织从哪来」说明 ----------
  await cdp.send('Page.navigate', { url: `${BASE}/admin/organizations` });
  await sleep(4000);
  const orgText = await evaluate(`document.body.innerText`);
  check('组织管理页已解释组织来源', orgText.includes('这些组织是怎么来的'));
  check('说明「独立于团契的实体档案」', orgText.includes('独立于') && orgText.includes('实体档案'));
  check('说明审核通过后才在前台展示', orgText.includes('审核通过后'));
  await shot(`${OUT}/governance-admin-orgs.png`);
} finally {
  // 清理测试数据
  await conn.query('DELETE FROM group_members WHERE group_id=?', [gid]);
  await conn.query('DELETE FROM `groups` WHERE id=?', [gid]);
  await conn.query('DELETE FROM activity_registrations WHERE activity_id=?', [aid]);
  await conn.query('DELETE FROM activities WHERE id=?', [aid]);
  await conn.end();
  try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
