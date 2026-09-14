// 验证：管理后台「通知中心」
//  1) 按类型分布 / 最近通知 的类型列必须是中文，不能再裸露英文 code
//  2) 通知模板支持界面化 新增 / 编辑 / 启用停用 / 删除（不依赖任何原生弹框）
// 运行: BASE=http://127.0.0.1:3190 DPORT=9400 node scripts/verify-admin-notifications.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3190';
const DPORT = Number(process.env.DPORT || 9400);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-admin-notif';
const PAGE = '/admin/notifications';
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
const [[admin]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role IN ('admin','moderator') ORDER BY FIELD(role,'admin','moderator') LIMIT 1"
);
if (!admin) { console.log('没有可用的管理员账号，跳过'); await conn.end(); process.exit(1); }
const TOKEN = signJwt(
  { sub: admin.id, role: admin.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);
console.log(`管理员: ${admin.id} (role=${admin.role})\n`);

// 测试模板编码用固定值，跑前先清掉历史残留
const TEST_CODE = 'zz_e2e_template_probe';
await conn.query(`DELETE FROM notification_templates WHERE code = ?`, [TEST_CODE]);

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

// ---------- 接口层 ----------
console.log('【接口层】');
const c1 = await api('POST', '/admin/notification-templates', {
  code: TEST_CODE, channel: 'inapp', titleTpl: '测试标题 {{title}}', bodyTpl: '测试正文 {{name}}', enabled: true,
});
check('新增模板返回 200', c1.status === 200, `status=${c1.status} ${JSON.stringify(c1.json)}`);
const NEW_ID = c1.json?.id;
const [[row1]] = await conn.query(`SELECT * FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('数据库已写入该模板', !!row1 && row1.title_tpl === '测试标题 {{title}}', JSON.stringify(row1 || {}));

const c1dup = await api('POST', '/admin/notification-templates', {
  code: TEST_CODE, channel: 'inapp', titleTpl: '重复', bodyTpl: '',
});
check('同 code+channel 重复新增被拒（409）', c1dup.status === 409, `status=${c1dup.status}`);

const c1bad = await api('POST', '/admin/notification-templates', {
  code: '中文编码', channel: 'inapp', titleTpl: 'x', bodyTpl: '',
});
check('非法编码（中文/大写不允许）被拒（400）', c1bad.status === 400, `status=${c1bad.status}`);

const u1 = await api('PATCH', `/admin/notification-templates/${NEW_ID}`, { titleTpl: '测试标题已改 {{title}}' });
check('编辑模板返回 200', u1.status === 200, `status=${u1.status}`);
const [[row2]] = await conn.query(`SELECT title_tpl, enabled FROM notification_templates WHERE id=?`, [NEW_ID]);
check('数据库标题模板已更新', row2?.title_tpl === '测试标题已改 {{title}}', String(row2?.title_tpl));

const u2 = await api('PATCH', `/admin/notification-templates/${NEW_ID}`, { enabled: false });
const [[row3]] = await conn.query(`SELECT enabled FROM notification_templates WHERE id=?`, [NEW_ID]);
check('停用生效（enabled=0）', u2.status === 200 && Number(row3?.enabled) === 0, `status=${u2.status} enabled=${row3?.enabled}`);

const d1 = await api('DELETE', `/admin/notification-templates/${NEW_ID}`);
const [[row4]] = await conn.query(`SELECT id FROM notification_templates WHERE id=?`, [NEW_ID]);
check('删除模板返回 200 且库内已无该行', d1.status === 200 && !row4, `status=${d1.status} left=${!!row4}`);

const d2 = await api('DELETE', `/admin/notification-templates/${NEW_ID}`);
check('删除不存在的模板返回 404', d2.status === 404, `status=${d2.status}`);

// 中文映射依赖：byType 返回的 type 必须都能在页面被翻成中文（抽查实际库里存在的类型）
const notif = await api('GET', '/admin/notifications');
const types = (notif.json?.byType || []).map((t) => t.type);
check('后台统计接口返回按类型分布数据', types.length > 0, `types=${types.length}`);

// ---------- 页面层（真实鼠标操作） ----------
console.log('\n【页面层】');
fs.mkdirSync(UDD, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DPORT}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--no-proxy-server', '--proxy-bypass-list=*',
  '--window-size=1440,1200', 'about:blank',
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
const realClick = async (expr) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const ok = await evaluate(`(() => { const el = ${expr}; if (!el) return false; document.documentElement.style.scrollBehavior = 'auto'; el.scrollIntoView({ block: 'center' }); return true; })()`);
    if (!ok) return false;
    await sleep(350);
    const info = await evaluate(`(() => {
      const el = ${expr}; if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitSelf: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))) };
    })()`);
    if (!info) return false;
    if (!info.hitSelf) continue;
    const { x, y } = info;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
};
const setInput = async (selExpr, value) => evaluate(`(() => {
  const el = ${selExpr}; if (!el) return 'no-el';
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`);

const DIALOGS = `document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]').length`;
const BTN = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const INPUT_BY_PH = (ph) => `document.querySelector('input[placeholder*=${JSON.stringify(ph)}]')`;
const BODY = `document.body.innerText`;

await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(TOKEN)});localStorage.setItem('platform_refresh_token',${JSON.stringify(TOKEN)});'ok'`);
await cdp.send('Page.navigate', { url: BASE + PAGE });
await sleep(4500);

// 1) 中文显示
const body = String(await evaluate(BODY) || '');
const enLeaks = types.filter((t) => new RegExp(`(^|\\s)${t}(\\s|$)`).test(body));
check('按类型分布：所有英文 code 均已显示为中文', enLeaks.length === 0, `仍裸露: ${enLeaks.join(', ')}`);
check('按类型分布：给出中文样例（如「媒体待审核」）', body.includes('媒体待审核') || body.includes('新评论'), '未见中文类型名');
check('最近通知表头含「类型」列', body.includes('类型'), '');

// 2) 新增模板（界面操作）
check('存在「+ 新增模板」按钮', !!(await evaluate(`!!${BTN('+ 新增模板')}`)));
await realClick(BTN('+ 新增模板'));
await sleep(600);
check('新增表单已展开（出现编码输入框）', !!(await evaluate(`!!${INPUT_BY_PH('activity_reminder')}`)));
check('新增/编辑全程无 dialog 弹窗', (await evaluate(DIALOGS)) === 0);

await setInput(INPUT_BY_PH('activity_reminder'), TEST_CODE);
await setInput(INPUT_BY_PH('新的活动'), '界面新增标题 {{title}}');
await setInput(`document.querySelector('textarea')`, '界面新增正文 {{name}}');
await shot('F:/sjjob/_shots/admin-notif-template-new.png');
await realClick(BTN('新增模板'));
await sleep(2000);
const [[row5]] = await conn.query(`SELECT title_tpl FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('界面「新增模板」后数据库已有记录', !!row5, '未写入');
check('界面新增后列表出现该模板行', String(await evaluate(BODY) || '').includes(TEST_CODE));

// 3) 停用 / 启用（界面）
const ROW = `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(TEST_CODE)}))`;
await realClick(`[...(${ROW}).querySelectorAll('button')].find(b=>b.textContent.trim()==='停用')`);
await sleep(1800);
const [[row6]] = await conn.query(`SELECT enabled FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('界面「停用」后库内 enabled=0', Number(row6?.enabled) === 0, String(row6?.enabled));

await realClick(`[...(${ROW}).querySelectorAll('button')].find(b=>b.textContent.trim()==='启用')`);
await sleep(1800);
const [[row7]] = await conn.query(`SELECT enabled FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('界面「启用」后库内 enabled=1', Number(row7?.enabled) === 1, String(row7?.enabled));

// 4) 编辑（界面）
await realClick(`[...(${ROW}).querySelectorAll('button')].find(b=>b.textContent.trim()==='编辑')`);
await sleep(600);
const editInputOk = await setInput(INPUT_BY_PH('新的活动'), '界面改过的标题 {{title}}');
await sleep(200);
await realClick(`[...document.querySelectorAll('tbody tr button')].find(b=>b.textContent.trim()==='保存')`);
await sleep(2000);
const [[row8]] = await conn.query(`SELECT title_tpl FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('界面「编辑→保存」后库内标题已更新', editInputOk === 'ok' && row8?.title_tpl === '界面改过的标题 {{title}}', String(row8?.title_tpl));
await shot('F:/sjjob/_shots/admin-notif-template-edit.png');

// 5) 删除（界面，二次确认）
await realClick(`[...(${ROW}).querySelectorAll('button')].find(b=>b.textContent.trim()==='删除')`);
await sleep(500);
check('点「删除」出现行内确认（不弹窗）', String(await evaluate(BODY) || '').includes('确认删除模板'), '');
check('二次确认全程无 dialog 弹窗', (await evaluate(DIALOGS)) === 0);
await realClick(BTN('确认删除'));
await sleep(2000);
const [[row9]] = await conn.query(`SELECT id FROM notification_templates WHERE code=?`, [TEST_CODE]);
check('界面「确认删除」后库内记录已移除', !row9, '仍存在');

// 收尾：不留测试数据
await conn.query(`DELETE FROM notification_templates WHERE code = ?`, [TEST_CODE]);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
chrome.kill();
await conn.end();
process.exit(fail ? 1 : 0);
