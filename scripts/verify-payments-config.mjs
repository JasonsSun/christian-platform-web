// 支付配置回归：验证后台「支付配置」保存→加密落库→脱敏回显→网关联动→清空还原的完整链路。
// 运行: BASE=http://127.0.0.1:3988 node scripts/verify-payments-config.mjs
// 前置：本地 MySQL 可用、存在 active 的 admin 用户、生产服务已在 BASE 启动。
// 说明：用 admin 的 JWT 直接调接口（绕过登录验证码），不依赖 UI 交互。
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3988';
const envTxt = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envTxt.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const [rows] = await conn.query("SELECT id,username FROM users WHERE role='admin' AND status='active' LIMIT 1");
if (!rows.length) { console.log('NO_ADMIN — skip'); process.exit(0); }
const admin = rows[0];
console.log('admin =', admin.username, admin.id);

const b64 = (s) => Buffer.from(s).toString('base64url');
function token(sub) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = { sub, role: 'admin', typ: 'access', exp: Math.floor(Date.now() / 1000) + 900, iss: 'christian-platform' };
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}
const T = token(admin.id);

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  return { status: r.status, j, txt };
}

const APPID = 'TESTAPPID123456';
const PRIV = 'PRIVATEKEY-SECRET-VALUE-abc';
const PUB = 'PUBLICKEY-VALUE-xyz';

console.log('\n[A] GET 初始状态');
let r = await api('GET', '/api/v1/admin/payments');
check('GET 200', r.status === 200, String(r.status));
check('返回 8 个字段', r.j?.fields?.length === 8, String(r.j?.fields?.length));

console.log('\n[B] PUT 保存支付宝三项密钥');
r = await api('PUT', '/api/v1/admin/payments', { fields: { alipay_app_id: APPID, alipay_private_key: PRIV, alipay_public_key: PUB } });
check('PUT 200 且更新 3 项', r.status === 200 && r.j?.updated === 3, JSON.stringify(r.j));

console.log('\n[C] GET 回显：非敏感回明文 / 敏感只回 set');
r = await api('GET', '/api/v1/admin/payments');
const byKey = Object.fromEntries((r.j?.fields || []).map((f) => [f.key, f]));
check('app_id 非敏感回显明文', byKey.alipay_app_id?.value === APPID, JSON.stringify(byKey.alipay_app_id));
check('app_id set=true', byKey.alipay_app_id?.set === true);
check('private_key set=true', byKey.alipay_private_key?.set === true);
check('private_key 不回明文', byKey.alipay_private_key?.value === '', JSON.stringify(byKey.alipay_private_key?.value));
check('整个响应不含私钥明文', !r.txt.includes(PRIV));
check('整个响应不含公钥明文', !r.txt.includes(PUB));

console.log('\n[D] 落库密文校验（直查 DB）');
const [srows] = await conn.query("SELECT key_name, value FROM settings WHERE key_name IN ('alipay_app_id','alipay_private_key','alipay_public_key')");
const sv = Object.fromEntries(srows.map((s) => [s.key_name, s.value]));
check('private_key 以 enc: 前缀加密存储', String(sv.alipay_private_key || '').startsWith('enc:'), String(sv.alipay_private_key).slice(0, 12));
check('库里不含私钥明文', !String(sv.alipay_private_key || '').includes(PRIV));
check('库里不含公钥明文', !String(sv.alipay_public_key || '').includes(PUB));

console.log('\n[E] 网关可用性联动');
r = await api('GET', '/api/v1/payments/gateways');
const alipay = (r.j?.online || []).find((g) => g.key === 'alipay');
check('支付宝 configured 变为 true', alipay?.configured === true, JSON.stringify(alipay));
check('响应不含私钥明文', !r.txt.includes(PRIV));

console.log('\n[F] 清空还原');
r = await api('PUT', '/api/v1/admin/payments', { fields: { alipay_app_id: '__CLEAR__', alipay_private_key: '__CLEAR__', alipay_public_key: '__CLEAR__' } });
check('清空 PUT 200', r.status === 200, JSON.stringify(r.j));
const [crows] = await conn.query("SELECT value FROM settings WHERE key_name IN ('alipay_app_id','alipay_private_key','alipay_public_key')");
check('清空后库值为空', crows.every((x) => String(x.value || '') === ''), JSON.stringify(crows));
r = await api('GET', '/api/v1/payments/gateways');
check('清空后 configured 恢复 false', (r.j?.online || []).find((g) => g.key === 'alipay')?.configured === false);

await conn.end();
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
