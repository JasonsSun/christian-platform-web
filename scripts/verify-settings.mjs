// 验证：系统设置的「入口」与「生效」
//   1) settings 表有种子数据，后台读得出来（之前是空表 → 页面只剩标题和保存按钮）
//   2) 系统设置属系统级治理：仅管理员可读写，模块审核员 / 普通成员一律 403
//   3) 保存真的落库（改站点名立刻回读得到）
//   4) 维护模式真的拦写：开启后普通成员写操作 503、管理员仍可写、GET 不受影响
//   5) 公开配置接口可被匿名读取，且只暴露站点名/公告/维护状态
// 运行: BASE=http://127.0.0.1:3200 node scripts/verify-settings.mjs
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
const [[mod]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='moderator' LIMIT 1");
if (!admin || !member) { console.log('缺少 admin / member 测试账号'); await conn.end(); process.exit(1); }

const T_ADMIN = tokenFor(admin), T_MEM = tokenFor(member), T_MOD = mod ? tokenFor(mod) : '';

const api = async (method, path, tok, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  // 本站 ok() 直接返回业务对象，错误才带 {code,message}，两种都要兼容
  const payload = j?.data ?? j ?? {};
  return { status: res.status, data: payload, code: j?.code ?? payload?.code, message: j?.message ?? payload?.message };
};

console.log('【1】配置入口：后台能读出配置项');

const rList = await api('GET', '/admin/settings', T_ADMIN);
const items = rList.data?.items || [];
const groups = new Set(items.map((i) => i.group));
check('管理员读 /(admin/settings) 200', rList.status === 200, `status=${rList.status}`);
check('配置项非空（旧版这里是空表，页面无内容）', items.length > 0, `items=${items.length}`);
check('四个分组齐全 general/upload/notify/search',
  ['general', 'upload', 'notify', 'search'].every((g) => groups.has(g)),
  `实际=${[...groups].join(',')}`);
check('上传限额 key 存在（上传接口真实读取）',
  items.some((i) => i.key === 'upload.max_video_mb'), '缺 upload.max_video_mb');
check('维护模式 key 存在', items.some((i) => i.key === 'maintenance_mode'), '缺 maintenance_mode');

console.log('\n【2】权限：系统设置属系统级治理，仅管理员');
if (T_MOD) {
  check('模块审核员读系统设置被拒 (403)', (await api('GET', '/admin/settings', T_MOD)).status === 403);
  check('模块审核员写系统设置被拒 (403)',
    (await api('PATCH', '/admin/settings', T_MOD, { items: [{ key: 'site_name', value: 'hack' }] })).status === 403);
} else {
  console.log('  - 库里没有审核员账号，跳过');
}
check('普通成员读系统设置被拒 (403)', (await api('GET', '/admin/settings', T_MEM)).status === 403);
check('匿名读系统设置被拒 (401)', (await api('GET', '/admin/settings', '')).status === 401);

console.log('\n【3】保存落库');
const newName = '圣约社区-' + Math.random().toString(36).slice(2, 6);
const [[before]] = await conn.query(`SELECT value FROM settings WHERE key_name='site_name'`);
check('改站点名返回 200', (await api('PATCH', '/admin/settings', T_ADMIN, { items: [{ key: 'site_name', value: newName }] })).status === 200);
const [[after]] = await conn.query(`SELECT value FROM settings WHERE key_name='site_name'`);
check('数据库已写入新值', after.value === newName, `before=${before.value} after=${after.value}`);
const rList2 = await api('GET', '/admin/settings', T_ADMIN);
check('回读接口同步可见（缓存已失效）',
  (rList2.data?.items || []).find((i) => i.key === 'site_name')?.value === newName, '');
await conn.query(`UPDATE settings SET value=? WHERE key_name='site_name'`, [before.value]);

console.log('\n【4】维护模式真的拦写');
await api('PATCH', '/admin/settings', T_ADMIN, { items: [{ key: 'maintenance_mode', value: 'true' }] });
await new Promise((r) => setTimeout(r, 300));
const readOnly = await api('GET', '/prayers', T_MEM);
check('维护期 GET 不受影响 (200)', readOnly.status === 200, `status=${readOnly.status}`);
const writeBlocked = await api('POST', '/prayers', T_MEM, { title: '维护期不该发出去', body: 'x' });
check('维护期普通成员写被拦 (503)', writeBlocked.status === 503, `status=${writeBlocked.status} ${writeBlocked.code || ''}`);
check('拦截带提示文案', !!writeBlocked.message && writeBlocked.message.length > 0, JSON.stringify(writeBlocked.message || ''));
const adminWrite = await api('POST', '/prayers', T_ADMIN, { title: '维护期管理员仍可发', body: 'x' });
check('维护期管理员仍可写 (非503)', adminWrite.status !== 503, `status=${adminWrite.status}`);

// 还原
await api('PATCH', '/admin/settings', T_ADMIN, { items: [{ key: 'maintenance_mode', value: 'false' }] });
await new Promise((r) => setTimeout(r, 300));
const restored = await api('POST', '/prayers', T_MEM, { title: '维护结束后可发', body: 'x' });
check('关闭维护后普通成员恢复写入 (非503)', restored.status !== 503, `status=${restored.status}`);

console.log('\n【5】公开配置接口');
const pub = await api('GET', '/settings/public', '');
check('匿名可读公开配置 (200)', pub.status === 200, `status=${pub.status}`);
check('返回站点名', typeof pub.data?.siteName === 'string' && pub.data.siteName.length > 0, JSON.stringify(pub.data));
check('维护状态字段存在', typeof pub.data?.maintenance === 'boolean', String(pub.data?.maintenance));
check('不泄露敏感配置（无 key 名清单）', !JSON.stringify(pub.data).includes('key_name'), '');

// 清理测试留下的代祷（prayers 正文列名是 body）
await conn.query(`DELETE FROM prayers WHERE body IN ('x') OR body LIKE 'E2E%'`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await conn.end();
process.exit(fail ? 1 : 0);
