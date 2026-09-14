// 验证：管理员「赞美诗管理」页的音频类型 / 人声版外链现在可以真正修改
// 背景：全站无弹框守卫把 window.prompt 置为恒返回 null，原先靠 prompt 的两处编辑点全部失效。
// 本脚本用真实鼠标事件验证内联编辑器可用，且全程不出现任何 dialog。
// 运行: BASE=http://127.0.0.1:3180 node scripts/verify-admin-song-edit.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3180';
const DPORT = Number(process.env.DPORT || 9390);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-admin-song';
const PAGE = '/admin/songs';
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

// 需要 admin / moderator 身份
const [[admin]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role IN ('admin','moderator') ORDER BY FIELD(role,'admin','moderator') LIMIT 1"
);
if (!admin) { console.log('没有可用的管理员账号，跳过'); await conn.end(); process.exit(1); }
const TOKEN = signJwt(
  { sub: admin.id, role: admin.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);
console.log(`管理员: ${admin.id} (role=${admin.role})`);

// 选一首「有音频、当前非人声、且没有外链」的诗歌作为测试对象
const [[song]] = await conn.query(
  `SELECT id, title, audio_type, audio_credit, listen_url, listen_source
     FROM songs WHERE audio_url IS NOT NULL AND audio_url <> ''
       AND (audio_type IS NULL OR audio_type <> 'vocal')
       AND (listen_url IS NULL OR listen_url = '')
     ORDER BY created_at LIMIT 1`
);
if (!song) { console.log('没有合适的测试诗歌，跳过'); await conn.end(); process.exit(1); }
const ORIGINAL = { ...song };
console.log(`测试诗歌: ${song.title} (${song.id}) 原类型=${song.audio_type}\n`);

const api = async (method, path, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

const restore = async () => {
  await api('PATCH', `/admin/songs/${song.id}`, {
    audioType: ORIGINAL.audio_type || 'instrumental',
    audioCredit: ORIGINAL.audio_credit || '',
    listenUrl: ORIGINAL.listen_url || '',
    listenSource: ORIGINAL.listen_source || '',
  });
};

// ---------- 无头 Chrome ----------
fs.mkdirSync(UDD, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1000', 'about:blank',
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
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const shot = async (out) => {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
};
/** 真实鼠标点击：滚动 + 命中校验 + 重试（避免平滑滚动导致坐标失效） */
const realClick = async (expr) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ok = await evaluate(`(() => { const el = ${expr}; if (!el) return false; document.documentElement.style.scrollBehavior = 'auto'; el.scrollIntoView({ block: 'center' }); return true; })()`);
    if (!ok) return false;
    await sleep(350);
    const info = await evaluate(`(() => {
      const el = ${expr}; if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitSelf: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))), hitTag: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 40) : 'null' };
    })()`);
    if (!info) return false;
    if (!info.hitSelf) continue; // 被遮挡/未滚动到位：重试
    const { x, y } = info;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
};
/** React 受控输入：必须走原生 setter + input 事件 */
const setInput = async (selExpr, value) => evaluate(`(() => {
  const el = ${selExpr}; if (!el) return 'no-el';
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`);

const ROW = (title) => `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(title)}))`;
const DIALOGS = `document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]').length`;
// 内联编辑器是表格里独立的一行 <tr>，探测/操作必须用全局选择器，不能限定在主行内
const CREDIT_INPUT = `document.querySelector('input[placeholder*="演唱"]')`;
const LISTEN_INPUT = `document.querySelector('input[placeholder*="留空并保存"]')`;
const SOURCE_INPUT = `document.querySelector('input[placeholder*="B站"]')`;
const SAVE_BTN = `[...document.querySelectorAll('tbody tr button')].find(b => b.textContent.trim() === '保存' || b.textContent.trim() === '保存中…')`;
// 顶部提示条是 <p>（分类徽章是 span，不会误命中）
const TIP = `[...document.querySelectorAll('p')].map(p => p.innerText).join(' || ')`;

await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(TOKEN)});localStorage.setItem('platform_refresh_token',${JSON.stringify(TOKEN)});'ok'`);
await cdp.send('Page.navigate', { url: BASE + PAGE });
await sleep(4000);

// ---------- 前置：守卫确实把 prompt 掐掉了 ----------
const promptReturns = await evaluate(`String(window.prompt('x'))`);
check('守卫已把 window.prompt 置为恒返回 null（正是原 bug 根因）', promptReturns === 'null', String(promptReturns));
check('页面已渲染诗歌表格', (await evaluate(`document.querySelectorAll('tbody tr').length`)) > 0);

// ---------- 场景 1：改音频类型 → 伴奏 改成 人声 ----------
const selectOpened = await setInput(`(${ROW(song.title)}).querySelector('select')`, 'vocal');
await sleep(500);
const editorInput = await evaluate(`!!${CREDIT_INPUT}`);
check('切换音频类型后出现内联编辑框（不再依赖 prompt）', selectOpened === 'ok' && editorInput === true, `setInput=${selectOpened} input=${editorInput}`);
check('编辑态全程无 dialog 弹窗', (await evaluate(DIALOGS)) === 0);
await shot('F:/sjjob/_shots/admin-song-editor.png');

await setInput(CREDIT_INPUT, '演唱：测试诗班 / 已获教会授权');
await realClick(SAVE_BTN);
await sleep(2000);
const tip1 = await evaluate(TIP);
check('保存后提示「已改标为人声」', tip1.includes('已改标为人声'), tip1);
const [[afterType]] = await conn.query('SELECT audio_type, audio_credit FROM songs WHERE id=?', [song.id]);
check('数据库 audio_type 已变为 vocal', afterType.audio_type === 'vocal', JSON.stringify(afterType));
check('数据库 audio_credit 已写入', (afterType.audio_credit || '').includes('测试诗班'), String(afterType.audio_credit));

await restore();
await sleep(300);
const [[restored1]] = await conn.query('SELECT audio_type FROM songs WHERE id=?', [song.id]);
check('已还原为原音频类型（不留测试数据）', restored1.audio_type === (ORIGINAL.audio_type || 'instrumental'), String(restored1.audio_type));

// ---------- 场景 2：登记人声版外链 ----------
await cdp.send('Page.navigate', { url: BASE + PAGE });
await sleep(3500);
await realClick(`[...(${ROW(song.title)}).querySelectorAll('button')].find(b => b.textContent.trim() === '登记链接')`);
await sleep(500);
const listenInput = await evaluate(`!!${LISTEN_INPUT}`);
check('点击「登记链接」出现外链内联编辑框', listenInput === true);
check('登记态无 dialog 弹窗', (await evaluate(DIALOGS)) === 0);

await setInput(LISTEN_INPUT, 'https://www.bilibili.com/video/BV1testOnly');
await setInput(SOURCE_INPUT, 'B站');
await realClick(SAVE_BTN);
await sleep(2000);
const tip2 = await evaluate(TIP);
check('保存后提示「已登记 B站 试听链接」', tip2.includes('已登记') && tip2.includes('B站'), tip2);
const [[afterListen]] = await conn.query('SELECT listen_url, listen_source FROM songs WHERE id=?', [song.id]);
check('数据库 listen_url 已写入', (afterListen.listen_url || '').includes('bilibili.com'), String(afterListen.listen_url));
await shot('F:/sjjob/_shots/admin-song-listen.png');

// ---------- 场景 3：再次编辑 → 留空保存＝清除 ----------
await realClick(`[...(${ROW(song.title)}).querySelectorAll('button')].find(b => b.textContent.trim() === '修改')`);
await sleep(500);
await setInput(LISTEN_INPUT, '');
await realClick(SAVE_BTN);
await sleep(2000);
const tip3 = await evaluate(TIP);
check('留空保存后提示「外部链接已清除」', tip3.includes('已清除'), tip3);
const [[afterClear]] = await conn.query('SELECT listen_url FROM songs WHERE id=?', [song.id]);
check('数据库 listen_url 已清空', !afterClear.listen_url, String(afterClear.listen_url));

// ---------- 收尾 ----------
await restore();
const [[finalRow]] = await conn.query('SELECT audio_type, audio_credit, listen_url, listen_source FROM songs WHERE id=?', [song.id]);
console.log(`\n还原后: ${JSON.stringify(finalRow)}（原值 ${JSON.stringify(ORIGINAL)}）`);
check('全部测试数据已还原', finalRow.audio_type === (ORIGINAL.audio_type || 'instrumental') && !finalRow.listen_url);

console.log(`\n${pass} passed, ${fail} failed`);
await conn.end();
cdp.ws.close(); bws.close();
chrome.kill('SIGKILL');
process.exit(fail ? 1 : 0);
