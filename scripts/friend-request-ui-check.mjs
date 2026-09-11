/**
 * 好友申请 UI 交互验证：
 *  1) 已接受(accepted)的申请 —— 必须渲染为「已接受」静态标签，不得再出现「接受/忽略」按钮
 *  2) pending 申请点「接受」后 —— 按钮当场变为「已接受」、Tab 角标同步下降、全程无弹框
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9455;
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const JWT_SECRET = 'christian-platform-local-dev-secret-please-change-in-production';
const ISSUER = 'christian-platform';
const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'christian_platform' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signToken = (u) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const data = b64({ sub: u.id, role: u.role, typ: 'access', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => { http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d)); }).on('error', rej); });
const postJson = (path, body, token) => new Promise((res, rej) => {
  const payload = JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (rr) => { let d = ''; rr.on('data', (c) => (d += c)); rr.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} res({ status: rr.statusCode, json: j }); }); });
  r.on('error', rej); r.write(payload); r.end();
});

class WS {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = []; }
  connect() {
    return new Promise((resolve, reject) => {
      const u = new URL(this.url);
      const key = Buffer.from(Math.random().toString(36)).toString('base64');
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
      req.on('upgrade', (res, socket) => {
        this.sock = socket; let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const len0 = buf[1] & 127; let off = 2; let len = len0;
            if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return;
            const payload = buf.slice(off, off + len).toString('utf8'); buf = buf.slice(off + len);
            try {
              const msg = JSON.parse(payload);
              if (msg.id && this.pending.has(msg.id)) { const { resolve: rs, reject: rj } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rj(new Error(JSON.stringify(msg.error))) : rs(msg.result); }
              else if (msg.method) this.handlers.forEach((h) => h(msg));
            } catch {}
          }
        });
        resolve();
      });
      req.on('error', reject); req.end();
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    const payload = Buffer.from(JSON.stringify({ id, method, params }));
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    const header = Buffer.alloc(2); header[0] = 0x81;
    if (payload.length < 126) { header[1] = 0x80 | payload.length; this.sock.write(Buffer.concat([header, mask, masked])); }
    else if (payload.length < 65536) { header[1] = 0x80 | 126; const l = Buffer.alloc(2); l.writeUInt16BE(payload.length); this.sock.write(Buffer.concat([header, l, mask, masked])); }
    else { header[1] = 0x80 | 127; const l = Buffer.alloc(8); l.writeBigUInt64BE(BigInt(payload.length)); this.sock.write(Buffer.concat([header, l, mask, masked])); }
    return new Promise((rs, rj) => this.pending.set(id, { resolve: rs, reject: rj }));
  }
  on(fn) { this.handlers.push(fn); }
}

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', '--user-data-dir=C:\\Windows\\Temp\\fr-ui-profile', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); } };

(async () => {
  const db = await mysql.createConnection(DB);
  const [users] = await db.query(`SELECT id, username, role FROM users`);
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const grace = byName.grace, admin = byName.admin, david = byName.david, sarah = byName.sarah;

  await sleep(2500);
  const ver = JSON.parse(await get(`http://127.0.0.1:${PORT}/json/version`));
  const list = JSON.parse(await get(`http://127.0.0.1:${PORT}/json/list`));
  const tgt = list.find((t) => t.type === 'page');
  const cdp = new WS(tgt.webSocketDebuggerUrl);
  await cdp.connect();
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result?.value;
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const setToken = async (token) => {
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await sleep(1800);
    await ev(`localStorage.setItem('platform_access_token',${JSON.stringify(token)});localStorage.setItem('platform_refresh_token',${JSON.stringify(token)});'ok'`);
  };
  const probe = async () => ev(`(() => {
    const btns = [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim());
    return {
      text: (document.body.innerText || '').slice(0, 1500),
      acceptBtns: btns.filter(t => t === '接受').length,
      declineBtns: btns.filter(t => t === '忽略').length,
      disabledLikeBtns: [...document.querySelectorAll('button')].filter(b => /已接受/.test(b.textContent||'')).length,
      acceptedLabels: [...document.querySelectorAll('[aria-disabled="true"]')].filter(e => /已接受/.test(e.textContent||'')).length,
      dialogs: document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]').length,
      tabLabel: [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).find(t=>t.startsWith('好友申请')) || '',
    };
  })()`);

  console.log('\n===== A. 已接受的历史申请(admin 视角) =====');
  {
    await setToken(signToken(admin));
    await cdp.send('Page.navigate', { url: `${BASE}/friends?tab=requests` });
    await sleep(3800);
    const p = await probe();
    check('页面出现「已接受」终态标签', /已接受/.test(p.text), p.text.slice(0, 160));
    check('页面出现「已处理」分组', /已处理/.test(p.text));
    check('已处理的申请不再渲染「接受」按钮', p.acceptBtns === 0, `acceptBtns=${p.acceptBtns}`);
    check('已处理的申请不再渲染「忽略」按钮', p.declineBtns === 0, `declineBtns=${p.declineBtns}`);
    check('Tab 角标不再把已处理计入(无 (n))', !/好友申请\s*\(\d+\)/.test(p.tabLabel), `tabLabel="${p.tabLabel}"`);
    check('页面无任何弹框', p.dialogs === 0, `dialogs=${p.dialogs}`);
  }

  console.log('\n===== B. pending 申请点「接受」的实时状态流转(sarah 视角) =====');
  let frId = '';
  {
    await db.query(`DELETE FROM friend_requests WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`, [david.id, sarah.id, sarah.id, david.id]);
    const send = await postJson('/api/v1/friends/request', { addresseeId: sarah.id, message: '平安,一起读经吗?' }, signToken(david));
    check('准备数据:发起申请成功', send.status === 200, `http=${send.status}`);
    const [rows] = await db.query(`SELECT id FROM friend_requests WHERE requester_id=? AND addressee_id=?`, [david.id, sarah.id]);
    frId = rows[0]?.id || '';

    await setToken(signToken(sarah));
    await cdp.send('Page.navigate', { url: `${BASE}/friends?tab=requests` });
    await sleep(3800);
    const before = await probe();
    check('待处理申请显示「接受」按钮', before.acceptBtns === 1, `acceptBtns=${before.acceptBtns}`);
    check('Tab 角标显示 (1)', /好友申请\s*\(1\)/.test(before.tabLabel), `tabLabel="${before.tabLabel}"`);
    check('点前无弹框', before.dialogs === 0);

    const clicked = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='接受'); if(!b) return 'no-button'; b.click(); return 'clicked'; })()`);
    check('点「接受」已触发', clicked === 'clicked', String(clicked));
    await sleep(3000);

    const after = await probe();
    check('接受后按钮不再存在(变为终态标签)', after.acceptBtns === 0, `acceptBtns=${after.acceptBtns}`);
    check('接受后出现「已接受」标签', /已接受/.test(after.text), after.text.slice(0, 160));
    check('接受后 Tab 角标归零', !/好友申请\s*\(\d+\)/.test(after.tabLabel), `tabLabel="${after.tabLabel}"`);
    check('接受后无弹框', after.dialogs === 0, `dialogs=${after.dialogs}`);

    const [st] = await db.query(`SELECT status FROM friend_requests WHERE id=?`, [frId]);
    check('数据库状态为 accepted', st[0]?.status === 'accepted', String(st[0]?.status));
  }

  console.log('\n===== C. 全流程无原生弹框调用 =====');
  {
    const native = await ev(`({ alert: /native code/.test(String(window.alert)), confirm: /native code/.test(String(window.confirm)) })`);
    check('window.alert 已被守卫改写', native.alert === false, JSON.stringify(native));
    check('window.confirm 已被守卫改写', native.confirm === false, JSON.stringify(native));
  }

  // 清理测试数据
  await db.query(`DELETE FROM friend_requests WHERE requester_id=? AND addressee_id=?`, [david.id, sarah.id]);
  await db.query(`DELETE FROM notifications WHERE user_id IN (?,?) AND type IN ('friend_request','friend_accepted')`, [sarah.id, david.id]);
  const [left] = await db.query(`SELECT COUNT(*) AS c FROM friend_requests`);
  console.log(`\n测试数据已清理,friend_requests 剩余 ${left[0].c} 条(应为 1)`);
  await db.end();

  console.log(`\n===== 结果:${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
