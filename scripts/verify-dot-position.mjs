// 验证：蓝点位置（每节开头）+ 未登录不渲染蓝点
// 运行: BASE=http://127.0.0.1:3170 node scripts/verify-dot-position.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3170';
const DPORT = Number(process.env.DPORT || 9380);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-dotverify';
const PAGE = '/bible/cuv/john/3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d)); }).on('error', rej);
});

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

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2713 ${n}`); } else { fail++; console.log(`  \u2717 ${n} ${e}`); } };

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const [[peer]] = await conn.query("SELECT id, role FROM users WHERE status='active' ORDER BY created_at LIMIT 1");
await conn.end();
if (!peer) { console.log('没有可用测试用户'); process.exit(1); }
const TOKEN = signJwt(
  { sub: peer.id, role: peer.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);

fs.mkdirSync(UDD, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,900', 'about:blank',
], { stdio: 'ignore' });

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = {};
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending[m.id]) { this.pending[m.id](m); delete this.pending[m.id]; } };
  }
  send(method, params = {}) { return new Promise((res) => { const id = ++this.id; this.pending[id] = res; this.ws.send(JSON.stringify({ id, method, params })); }); }
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

const PROBE = `(() => {
  const dots = Array.from(document.querySelectorAll('.read-dot'));
  const btn = document.querySelector('.read-verse button');
  const r = dots[0] ? dots[0].getBoundingClientRect() : null;
  const br = btn ? btn.getBoundingClientRect() : null;
  return {
    dots: dots.length,
    verses: document.querySelectorAll('.read-verse').length,
    dotX: r ? Math.round(r.left) : null,
    dotW: r ? Math.round(r.width) : null,
    btnX: br ? Math.round(br.left) : null,
    pos: dots[0] ? getComputedStyle(dots[0]).position : null,
  };
})()`;

// ---- 场景 A：未登录 ----
await cdp.send('Page.navigate', { url: BASE + PAGE });
await sleep(5000);
const anon = await evaluate(PROBE);
console.log('未登录:', JSON.stringify(anon));
check('未登录不渲染蓝点', anon.dots === 0, JSON.stringify(anon));
await shot('F:/sjjob/_shots/dot-anon.png');

// ---- 注入 token 后重新加载 ----
await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(TOKEN)});localStorage.setItem('platform_refresh_token',${JSON.stringify(TOKEN)});'ok'`);
await cdp.send('Page.navigate', { url: BASE + PAGE });
await sleep(2300);
await shot('F:/sjjob/_shots/dot-auth-early.png'); // 驻留未满 3s → 蓝点仍可见
await sleep(3300);
const authed = await evaluate(PROBE);
console.log('已登录:', JSON.stringify(authed));
check('已登录每节各一个蓝点', authed.dots > 0 && authed.dots === authed.verses, JSON.stringify(authed));
check('蓝点绝对定位', authed.pos === 'absolute', String(authed.pos));
check('蓝点在节号左侧（小节开头）', authed.dotX !== null && authed.btnX !== null && authed.dotX < authed.btnX, `dotX=${authed.dotX} btnX=${authed.btnX}`);
await shot('F:/sjjob/_shots/dot-auth.png');

console.log(`\n${pass} passed, ${fail} failed`);
cdp.ws.close(); bws.close();
chrome.kill('SIGKILL');
process.exit(fail ? 1 : 0);
