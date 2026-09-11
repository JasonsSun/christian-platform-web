/**
 * 捐赠专区专项巡检（一次性脚本，运行于 apps/web 下）
 *  1) 访客视角：/donate 渲染 ****元、不含真实金额；/donate/new 未登录自动跳登录页
 *  2) 普通用户：/donate 不含真实金额；/admin/donations 被拦截
 *  3) 管理员：/donate 与 /admin/donations 显示真实金额
 *  全程断言：无弹框、守卫生效、无控制台错误
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import mysql from 'mysql2/promise';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9455;
const BASE = process.argv[2] || 'http://127.0.0.1:3000';

const SECRET = (() => {
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/^JWT_SECRET=(.+)$/m);
  return m ? m[1].trim() : 'change-me-in-production-change-me-in-production';
})();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signToken = (id, role) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: id, role, typ: 'access', iss: 'christian-platform', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => { http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d)); }).on('error', rej); });

class WS {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = []; }
  connect() {
    return new Promise((resolve, reject) => {
      const u = new URL(this.url);
      const key = Buffer.from(Math.random().toString(36)).toString('base64');
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
      req.on('upgrade', (res, socket) => {
        this.sock = socket;
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const len0 = buf[1] & 127; let off = 2; let len = len0;
            if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return;
            const payload = buf.slice(off, off + len).toString('utf8');
            buf = buf.slice(off + len);
            try {
              const msg = JSON.parse(payload);
              if (msg.id && this.pending.has(msg.id)) {
                const { resolve: rs, reject: rj } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                msg.error ? rj(new Error(JSON.stringify(msg.error))) : rs(msg.result);
              } else if (msg.method) this.handlers.forEach((h) => h(msg));
            } catch { /* ignore */ }
          }
        });
        resolve();
      });
      req.on('error', reject);
      req.end();
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    const payload = Buffer.from(JSON.stringify({ id, method, params }));
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    const header = Buffer.alloc(2);
    header[0] = 0x81;
    if (payload.length < 126) { header[1] = 0x80 | payload.length; this.sock.write(Buffer.concat([header, mask, masked])); }
    else if (payload.length < 65536) { header[1] = 0x80 | 126; const l = Buffer.alloc(2); l.writeUInt16BE(payload.length); this.sock.write(Buffer.concat([header, l, mask, masked])); }
    else { header[1] = 0x80 | 127; const l = Buffer.alloc(8); l.writeBigUInt64BE(BigInt(payload.length)); this.sock.write(Buffer.concat([header, l, mask, masked])); }
    return new Promise((rs, rj) => this.pending.set(id, { resolve: rs, reject: rj }));
  }
  on(fn) { this.handlers.push(fn); }
}

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900',
  '--user-data-dir=C:\\Windows\\Temp\\donate-check-profile', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch { /* ignore */ } };
process.on('exit', cleanup);

async function main() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // 真实金额基准（管理员应看到 2100 累计）
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'christian_platform' });
  const [users] = await db.query("SELECT id, username, role FROM users WHERE username IN ('grace','admin')");
  const [[agg]] = await db.query("SELECT COALESCE(SUM(amount_cents),0) s FROM donations WHERE status='confirmed'");
  await db.end();
  const realTotal = String(Number(agg.s) / 100);
  const grace = users.find((u) => u.username === 'grace');
  const admin = users.find((u) => u.username === 'admin');
  console.log(`基准：已确认累计真实金额 = ¥${realTotal}（此数字绝不能出现在非管理员页面）\n`);

  let ver;
  for (let i = 0; i < 40; i++) { try { ver = JSON.parse(await get(`http://127.0.0.1:${PORT}/json/version`)); break; } catch { await sleep(300); } }
  if (!ver) throw new Error('CDP 未就绪');
  const bws = new WS(ver.webSocketDebuggerUrl);
  await bws.connect();
  await bws.send('Target.createTarget', { url: 'about:blank' });
  await sleep(400);
  const list = JSON.parse(await get(`http://127.0.0.1:${PORT}/json/list`));
  const tgt = list.find((t) => t.type === 'page');
  const cdp = new WS(tgt.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleErrors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails || {}; consoleErrors.push(d.exception?.description || d.text || 'exception'); }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const evalx = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result?.value;
  };

  const POPUP = `(() => {
    const vis=(el)=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>4&&r.height>4;};
    const hits=[];
    document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"]').forEach(el=>{if(vis(el))hits.push(el.tagName);});
    document.querySelectorAll('body > *').forEach(el=>{const cs=getComputedStyle(el);if(cs.position!=='fixed'&&cs.position!=='absolute')return;const z=parseInt(cs.zIndex||'0',10);if(!Number.isFinite(z)||z<1000)return;if(el.hasAttribute&&el.hasAttribute('data-guard'))return;const r=el.getBoundingClientRect();if(r.width>=innerWidth*0.9&&r.height>=innerHeight*0.9&&vis(el))hits.push('overlay:'+el.tagName);});
    return hits;
  })()`;

  const setToken = (tk) =>
    evalx(`localStorage.clear();${tk ? `localStorage.setItem('platform_access_token',${JSON.stringify(tk)});localStorage.setItem('platform_refresh_token',${JSON.stringify(tk)});` : ''}'ok'`);

  async function visit(path, wait = 3000) {
    consoleErrors.length = 0;
    await cdp.send('Page.navigate', { url: BASE + path });
    await sleep(wait);
    const url = await evalx('location.pathname + location.search');
    const text = await evalx("(document.body?document.body.innerText:'').slice(0,4000)");
    const popups = await evalx(POPUP);
    const guarded = await evalx("(() => { try { return !/native code/.test(String(window.alert)) } catch(e){ return false } })()");
    const errs = consoleErrors.filter((e) => !/favicon|Failed to load resource.*404/i.test(e));
    return { url, text: text || '', popups, guarded, errs };
  }

  // ============ 1. 访客 ============
  console.log('【访客视角】');
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await sleep(1200);
  await setToken(null);

  let r = await visit('/donate', 3500);
  check('访客 /donate 正常渲染', /爱心捐赠/.test(r.text), r.text.slice(0, 40).replace(/\n/g, ' '));
  check('访客 /donate 金额显示为星号脱敏', r.text.includes('****'), '');
  check('访客 /donate 不泄漏真实金额', !r.text.split('****').join('').includes(realTotal), `不应出现 ${realTotal}`);
  check('访客 /donate 无弹框', Array.isArray(r.popups) && r.popups.length === 0, (r.popups || []).join(','));
  check('访客 /donate 守卫生效(alert 已被覆盖)', r.guarded === true);
  check('访客 /donate 无控制台错误', r.errs.length === 0, r.errs.slice(0, 2).join(' | '));

  r = await visit('/donate/new', 3500);
  check('访客 /donate/new 自动跳转登录页', String(r.url).startsWith('/login'), `实际 url=${r.url}`);
  check('访客 /donate/new 携带回跳参数', /next=%2Fdonate%2Fnew|next=\/donate\/new/.test(String(r.url)), String(r.url));
  check('访客 /donate/new 无弹框', Array.isArray(r.popups) && r.popups.length === 0, (r.popups || []).join(','));

  // ============ 2. 普通用户 ============
  console.log('\n【普通用户 grace】');
  await setToken(signToken(grace.id, 'member'));

  r = await visit('/donate', 3500);
  check('用户 /donate 正常渲染', /爱心捐赠/.test(r.text));
  check('用户 /donate 不泄漏真实金额', !r.text.split('****').join('').includes(realTotal), `不应出现 ${realTotal}`);
  check('用户 /donate 无弹框', Array.isArray(r.popups) && r.popups.length === 0, (r.popups || []).join(','));
  check('用户 /donate 无控制台错误', r.errs.length === 0, r.errs.slice(0, 2).join(' | '));

  r = await visit('/admin/donations', 3500);
  check('用户 /admin/donations 被拒绝显示', /无权限|请先登录/.test(r.text), r.text.slice(0, 40).replace(/\n/g, ' '));
  check('用户 /admin/donations 不泄漏真实金额', !r.text.split('****').join('').includes(realTotal));

  // ============ 3. 管理员 ============
  console.log('\n【管理员 admin】');
  await setToken(signToken(admin.id, 'admin'));

  r = await visit('/donate', 3500);
  check('管理员 /donate 正常渲染', /爱心捐赠/.test(r.text));
  check(`管理员 /donate 可见真实累计金额 ${realTotal}`, r.text.includes(realTotal), '');
  check('管理员 /donate 标注「仅管理员可见」', /仅管理员可见/.test(r.text));
  check('管理员 /donate 无弹框', Array.isArray(r.popups) && r.popups.length === 0, (r.popups || []).join(','));
  check('管理员 /donate 无控制台错误', r.errs.length === 0, r.errs.slice(0, 2).join(' | '));

  r = await visit('/admin/donations', 4000);
  check('管理员 /admin/donations 正常渲染', /捐赠管理/.test(r.text));
  check('管理员 /admin/donations 显示真实金额', r.text.includes(realTotal), `应含 ${realTotal}`);
  check('管理员 /admin/donations 无弹框', Array.isArray(r.popups) && r.popups.length === 0, (r.popups || []).join(','));
  check('管理员 /admin/donations 无控制台错误', r.errs.length === 0, r.errs.slice(0, 2).join(' | '));
  check('管理员 /admin/donations 守卫生效', r.guarded === true);
  check('侧栏含「捐赠管理」入口', /捐赠管理/.test(r.text));

  // 驳回按钮点击应跳 /confirm（跳转式，不弹框）
  const clicked = await evalx(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='驳回'&&!x.disabled);
    if(!b) return 'no-button'; b.click(); return 'clicked';
  })()`);
  if (clicked === 'clicked') {
    await sleep(2200);
    const u2 = await evalx('location.pathname + location.search');
    const p2 = await evalx(POPUP);
    check('点「驳回」跳转确认页而非弹框', String(u2).startsWith('/confirm'), `url=${u2}`);
    check('确认页无弹框', Array.isArray(p2) && p2.length === 0, (p2 || []).join(','));
    const t2 = await evalx("(document.body?document.body.innerText:'').slice(0,300)");
    check('确认页展示驳回上下文', /驳回/.test(t2 || ''), (t2 || '').slice(0, 40).replace(/\n/g, ' '));
  } else {
    check('管理员 /admin/donations 存在可点「驳回」按钮', false, clicked);
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 捐赠专区巡检 ${results.length - failed.length}/${results.length} PASS ====`);
  if (failed.length) failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
  cleanup();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('巡检失败:', e.message); cleanup(); process.exit(1); });
