// 验证：管理员在后台「系统设置 → 模块开关」下线某个模块后
//   1) 接口层：该模块 API 对普通成员 403 MODULE_DISABLED，管理员仍可用（后台要能治理历史数据）
//   2) 页面层：模块首页不再渲染原内容，显示「已暂停服务」占位页
//   3) 导航层：公开配置接口返回 disabledModules，桌面/移动端导航据此隐藏入口
//   4) 数据不丢：重新打开后一切恢复
// 运行: BASE=http://127.0.0.1:3200 node scripts/verify-module-switch.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
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
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n} ${e}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const tokenFor = (u) => signJwt(
  { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);

const [[admin]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='admin' LIMIT 1");
const [[member]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='member' LIMIT 1");
const T_ADMIN = tokenFor(admin), T_MEM = tokenFor(member);

const api = async (method, path, tok, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  const payload = j?.data ?? j ?? {};
  return { status: res.status, data: payload, code: j?.code ?? payload?.code, message: j?.message ?? payload?.message };
};

/** 后台写配置 */
const setModule = async (key, value) => {
  await api('PATCH', '/admin/settings', T_ADMIN, { items: [{ key: `module.${key}`, value }] });
  await new Promise((r) => setTimeout(r, 400)); // 等服务端缓存失效
};
/** 取某 key 的原文 */
const pageHtml = async (path) => {
  const res = await fetch(BASE + path, { headers: { 'Cache-Control': 'no-store' } });
  return res.text();
};

// 以「读经计划」为样本：用户明确提到想下架它
const MOD = 'plans';
const PAGE = '/plans';
const ENDPOINT = '/plans';

console.log('【1】默认状态（模块开放）');
await setModule(MOD, 'true');
const before = await api('GET', ENDPOINT, T_MEM);
check('开放时成员可读接口 (200)', before.status === 200, `status=${before.status}`);
const htmlOpen = await pageHtml(PAGE);
check('开放时页面正常渲染（无「已暂停服务」）', !htmlOpen.includes('已暂停服务'), '');

console.log('\n【2】后台下线「读经计划」');
await setModule(MOD, 'false');
const after = await api('GET', ENDPOINT, T_MEM);
check('下线后成员读接口 403', after.status === 403, `status=${after.status}`);
check('错误码为 MODULE_DISABLED', after.code === 'MODULE_DISABLED', `code=${after.code}`);
const adminAfter = await api('GET', ENDPOINT, T_ADMIN);
check('管理员仍可访问（后台治理不受影响）', adminAfter.status === 200, `status=${adminAfter.status}`);

console.log('\n【3】页面层展示「已暂停服务」');
const htmlOff = await pageHtml(PAGE);
check('页面含「已暂停服务」占位', htmlOff.includes('已暂停服务'), '');
check('占位页标明模块名「读经计划」', htmlOff.includes('读经计划'), '');

console.log('\n【4】导航隐藏');
const pub = await api('GET', '/settings/public', '');
check('公开接口返回 disabledModules', Array.isArray(pub.data?.disabledModules), JSON.stringify(pub.data?.disabledModules));
check('其中含 plans', (pub.data?.disabledModules || []).includes('plans'), '');
// 服务端渲染即时生效：取一个动态路由（首页有 ISR + 构建期预渲染，
// 服务端那份可能是旧快照，那种情况下由水合后的客户端校正）
const communityHtml = await pageHtml('/community');
check('SSR 导航不再输出「/plans」入口', !communityHtml.includes('href="/plans"'), '仍含 /plans 链接');
check('SSR 导航仍保留未下线模块（/groups）', communityHtml.includes('href="/groups"'), '误伤了其它模块');

console.log('\n【5】数据不丢，重新上线即恢复');
await setModule(MOD, 'true');
const reopen = await api('GET', ENDPOINT, T_MEM);
check('重开后成员读接口恢复 200', reopen.status === 200, `status=${reopen.status}`);
const htmlReopen = await pageHtml(PAGE);
check('重开后页面恢复', !htmlReopen.includes('已暂停服务'), '');
const pub2 = await api('GET', '/settings/public', '');
check('公开接口 disabledModules 不含 plans', !(pub2.data?.disabledModules || []).includes('plans'), '');

console.log('\n【6】顺带验证另一个模块（圣经）不会误伤其它模块');
await setModule('bible', 'false');
check('圣经接口被关 (403)', (await api('GET', '/bible', T_MEM)).status === 403, '');
check('无关模块（settings/public）不受影响',
  (await api('GET', '/settings/public', '')).status === 200, '');
await setModule('bible', 'true');
check('圣经重开后恢复 (200)', (await api('GET', '/bible', T_MEM)).status === 200, '');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await conn.end();
process.exit(fail ? 1 : 0);
