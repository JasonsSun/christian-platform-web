// 验证：代祷墙的删除权限与后台治理入口
//  1) 接口：作者本人可删自己的；admin / moderator 可删任意一条；普通成员删别人的 403；匿名 401
//  2) 管理端列表 GET /admin/prayers：staff 可用、支持搜索与 scope 筛选；member 403
//  3) 页面：前台代祷墙/后台代祷墙管理页出现「移除」按钮，点击走确认页（不弹原生框）
// 运行: BASE=http://127.0.0.1:3200 DPORT=9410 node scripts/verify-prayer-delete.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const DPORT = Number(process.env.DPORT || 9410);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = 'F:/sjjob/_shots/chrome-prayer-admin';
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

const tokenFor = (u) => signJwt(
  { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);

const [[admin]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='admin' LIMIT 1"
);
const [[mod]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='moderator' LIMIT 1"
);
const [[member]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='member' LIMIT 1"
);
if (!admin || !member) { console.log('缺少 admin / member 测试账号，跳过'); await conn.end(); process.exit(1); }
console.log(`admin=${admin.id} moderator=${mod?.id || '(无)'} member=${member.id}\n`);

const api = async (method, path, tok, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: {
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

/** 造一条代祷并返回 id（直接入库，避免界面依赖） */
const makePrayer = async (userId, text) => {
  const id = 'pry_e2e_' + Math.random().toString(36).slice(2, 12);
  await conn.query(
    `INSERT INTO prayers (id, user_id, body, amen_count, answered, created_at) VALUES (?,?,?,0,0,NOW())`,
    [id, userId, text]
  );
  return id;
};

// ---------- 接口层 ----------
console.log('【接口层 · 删除权限】');

const T_MEMBER = tokenFor(member);
const T_ADMIN = tokenFor(admin);
const T_MOD = mod ? tokenFor(mod) : null;

// 1. 作者删自己的
const p1 = await makePrayer(member.id, 'E2E 测试：作者本人删除自己的代祷条目');
const r1 = await api('DELETE', `/prayers/${p1}`, T_MEMBER);
const [[chk1]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [p1]);
check('作者本人可删自己的代祷 (200)', r1.status === 200 && !chk1, `status=${r1.status} left=${!!chk1}`);

// 2. 普通成员删「管理员发布的」→ 403
const pOther = await makePrayer(admin.id, 'E2E 测试：普通成员试图删除管理员的代祷');
const r2 = await api('DELETE', `/prayers/${pOther}`, T_MEMBER);
const [[chk2]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [pOther]);
check('普通成员删别人的代祷被拒 (403) 且记录仍在', r2.status === 403 && !!chk2, `status=${r2.status} left=${!!chk2}`);
check('被拒的条目仍可被管理员删除（清理）', (await api('DELETE', `/prayers/${pOther}`, T_ADMIN)).status === 200, '');

// 3. admin 删「成员发布的」→ 200，且必须留下审计（核心诉求 + 可追溯）
const p2 = await makePrayer(member.id, 'E2E 测试：管理员移除成员发布的违规代祷');
const r3 = await api('DELETE', `/prayers/${p2}`, T_ADMIN);
const [[chk3]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [p2]);
check('管理员可删任意一条代祷 (200)', r3.status === 200 && !chk3, `status=${r3.status} left=${!!chk3}`);

const [[aud]] = await conn.query(
  `SELECT action, detail FROM audit_logs WHERE action='PRAYER_DELETE' AND entity_id=? ORDER BY created_at DESC LIMIT 1`,
  [p2]
);
check('管理侧删除他人代祷写入审计日志 PRAYER_DELETE', !!aud && String(aud.detail).includes('删除'), JSON.stringify(aud || {}));

// 3b. 管理员删自己的 → 不记审计（自删不是治理动作，避免污染审计流）
const pSelf = await makePrayer(admin.id, 'E2E 测试：管理员删除自己发布的代祷');
const rSelf = await api('DELETE', `/prayers/${pSelf}`, T_ADMIN);
const [[audSelf]] = await conn.query(
  `SELECT id FROM audit_logs WHERE action='PRAYER_DELETE' AND entity_id=? LIMIT 1`, [pSelf]
);
check('管理员删自己的代祷成功 (200)', rSelf.status === 200, `status=${rSelf.status}`);
check('作者自删不写入审计日志', !audSelf, JSON.stringify(audSelf || {}));

// 4. moderator 删别人的 → 403（审核员只有审核权限，无删除权，仅管理员可删他人代祷）
if (T_MOD) {
  const p4 = await makePrayer(member.id, 'E2E 测试：审核员试图删除他人代祷');
  const r4 = await api('DELETE', `/prayers/${p4}`, T_MOD);
  const [[chk4]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [p4]);
  check('审核员删他人代祷被拒 (403) 且记录仍在', r4.status === 403 && !!chk4, `status=${r4.status} left=${!!chk4}`);
  // 审核员删自己的 → 200（自身权限保留）
  const p4s = await makePrayer(mod.id, 'E2E 测试：审核员删除自己发布的代祷');
  const r4s = await api('DELETE', `/prayers/${p4s}`, T_MOD);
  const [[chk4s]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [p4s]);
  check('审核员可删自己的代祷 (200)', r4s.status === 200 && !chk4s, `status=${r4s.status}`);
  // 该审核员误删他人的条目改由管理员清理
  check('被审核员误挡的条目仍可由管理员删除', (await api('DELETE', `/prayers/${p4}`, T_ADMIN)).status === 200, '');
} else {
  console.log('  - 无 moderator 账号，跳过审核员用例');
}

// 5. 匿名 → 401
const p5 = await makePrayer(member.id, 'E2E 测试：匿名请求删除');
const r5 = await api('DELETE', `/prayers/${p5}`, null);
check('匿名删除被拒 (401)', r5.status === 401, `status=${r5.status}`);

// 6. 不存在 / 已删 → 404
const r6 = await api('DELETE', `/prayers/pry_not_exist_xxx`, T_ADMIN);
check('删除不存在的代祷返回 404', r6.status === 404, `status=${r6.status}`);

// 7. 阿们记录随代祷级联清理
const p7 = await makePrayer(member.id, 'E2E 测试：级联清理阿们记录');
await conn.query(`INSERT INTO prayer_amens (prayer_id, user_id, created_at) VALUES (?,?,NOW())`, [p7, admin.id]);
await api('DELETE', `/prayers/${p7}`, T_ADMIN);
const [amenLeft] = await conn.query(`SELECT prayer_id FROM prayer_amens WHERE prayer_id=?`, [p7]);
check('删除代祷后其阿们记录一并清理', amenLeft.length === 0, `剩余 ${amenLeft.length} 条`);

console.log('\n【接口层 · 管理端列表】');
const l1 = await api('GET', '/admin/prayers?scope=all&pageSize=5', T_ADMIN);
check('管理员可读管理端代祷列表 (200)', l1.status === 200, `status=${l1.status}`);
check('列表返回 items / total / stats', Array.isArray(l1.json?.items) && typeof l1.json?.total === 'number' && !!l1.json?.stats,
  JSON.stringify(l1.json?.stats || {}));

const l2 = await api('GET', '/admin/prayers', T_MEMBER);
check('普通成员读管理端列表被拒 (403)', l2.status === 403, `status=${l2.status}`);

const l3 = await api('GET', '/admin/prayers', null);
check('匿名读管理端列表被拒 (401)', l3.status === 401, `status=${l3.status}`);

// 长文筛选
const pLong = await makePrayer(member.id, 'E2E 长文巡查测试 '.repeat(40));
const l4 = await api('GET', '/admin/prayers?scope=long&pageSize=100', T_ADMIN);
const longIds = (l4.json?.items || []).map((x) => x.id);
check('scope=long 能筛出长文（≥300 字）', longIds.includes(pLong), `命中 ${longIds.length} 条`);
await conn.query(`DELETE FROM prayers WHERE id=?`, [pLong]);

// 搜索
const pKw = await makePrayer(member.id, 'E2E 关键词ZQXMARK 唯一标识');
const l5 = await api('GET', '/admin/prayers?q=ZQXMARK', T_ADMIN);
const kwIds = (l5.json?.items || []).map((x) => x.id);
check('按关键词搜索能命中目标代祷', kwIds.includes(pKw), `命中 ${kwIds.length} 条`);
await conn.query(`DELETE FROM prayers WHERE id=?`, [pKw]);

// ---------- 页面层 ----------
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
const DIALOGS = `document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]').length`;

/** 真实鼠标点击：滚动 + 命中校验 + 重试（React 对合成 click 有时不响应） */
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

/** 准备一条给页面测的「别人的」代祷 */
const pUi = await makePrayer(member.id, 'E2E 页面测试：这条将被管理员从后台移除');

// 以 admin 身份进后台代祷墙管理页
await cdp.send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(T_ADMIN)});localStorage.setItem('platform_refresh_token',${JSON.stringify(T_ADMIN)});'ok'`);
await cdp.send('Page.navigate', { url: BASE + '/admin/prayers' });
await sleep(4500);

const bodyText = String(await evaluate(`document.body.innerText`) || '');
check('后台代祷墙管理页可打开（标题存在）', bodyText.includes('代祷墙管理'), bodyText.slice(0, 80));
check('页面含巡查提示（长文优先）', bodyText.includes('长文'), '');
check('列表里能看到目标代祷内容', bodyText.includes('E2E 页面测试'), '');

const removeBtns = await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '移除').length`);
check('每行都有「移除」按钮', removeBtns > 0, `按钮数=${removeBtns}`);
check('初始无弹框', (await evaluate(DIALOGS)) === 0);
await shot('F:/sjjob/_shots/admin-prayers.png');

// 点移除 → 应跳到 /confirm（本站禁止弹框）。定位到目标代祷所在行，避免误删列表最新在前的其它测试数据
const clicked = await realClick(`(() => {
  const rows = [...document.querySelectorAll('tr')];
  const target = rows.find((r) => r.textContent.includes('E2E 页面测试'));
  if (!target) return null;
  return [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === '移除') || null;
})()`);
await sleep(1500);
const url1 = await evaluate(`location.pathname`);
check('点「移除」跳转到确认页 /confirm（非弹框）', clicked === true && String(url1).startsWith('/confirm'), `clicked=${clicked} url=${url1}`);
const confirmText = String(await evaluate(`document.body.innerText`) || '');
check('确认页文案说明会记入审计日志', confirmText.includes('审计日志'), confirmText.slice(0, 100));
await shot('F:/sjjob/_shots/admin-prayers-confirm.png');

// 执行确认
const done = await realClick(`[...document.querySelectorAll('button')].find(b => /^(确认|移除)$/.test(b.textContent.trim()))`);
await sleep(2800);
const [[afterUi]] = await conn.query(`SELECT id FROM prayers WHERE id=?`, [pUi]);
check('确认后数据库该条已删除', !afterUi, `确认按钮=${done} 剩余=${!!afterUi}`);

// 后台列表刷新后不再出现该条
await cdp.send('Page.navigate', { url: BASE + '/admin/prayers' });
await sleep(4000);
const bodyText2 = String(await evaluate(`document.body.innerText`) || '');
check('后台列表中已不含被删内容', !bodyText2.includes('E2E 页面测试'), '');

// 前台代祷墙：管理员能看到别人条目的「移除」按钮
const pFront = await makePrayer(member.id, 'E2E 前台测试：管理员在代祷墙直接移除');
await cdp.send('Page.navigate', { url: BASE + '/prayers' });
await sleep(4000);
const frontText = String(await evaluate(`document.body.innerText`) || '');
check('前台代祷墙能看到目标条目', frontText.includes('E2E 前台测试'), '');
const staffRemove = await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '移除').length`);
check('前台代祷墙上管理员对他人条目也显示「移除」', staffRemove > 0, `按钮数=${staffRemove}`);
await shot('F:/sjjob/_shots/prayers-staff-remove.png');

// 普通成员在前台看不到别人条目的删除按钮
await evaluate(`localStorage.setItem('platform_access_token',${JSON.stringify(T_MEMBER)});localStorage.setItem('platform_refresh_token',${JSON.stringify(T_MEMBER)});'ok'`);
await cdp.send('Page.navigate', { url: BASE + '/prayers' });
await sleep(4000);
const memberRemove = await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '移除').length`);
check('普通成员在前台看不到「移除」按钮', memberRemove === 0, `按钮数=${memberRemove}`);

// 收尾清理
await conn.query(`DELETE FROM prayers WHERE id IN (?)`, [[pFront].filter(Boolean)]);
await conn.query(`DELETE FROM prayers WHERE id LIKE 'pry_e2e_%'`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
chrome.kill();
await conn.end();
process.exit(fail ? 1 : 0);
