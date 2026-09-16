import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

function loadEnv() {
  const p = '.env.local';
  if (!existsSync(p)) return {};
  const txt = readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/\r$/, '').replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv();
const DB = {
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '123456',
  database: env.DB_NAME || 'christian_platform',
};
const JWT_SECRET = env.JWT_SECRET || 'change-me-in-production-change-me-in-production';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3200';

const b64u = (s) => Buffer.from(s).toString('base64url');
function signJwt(role, sub) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ sub, role, typ: 'access', iss: 'christian-platform', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}
async function jget(path, token) {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function jsend(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function main() {
  const conn = await mysql.createConnection(DB);
  const [admins] = await conn.query("SELECT id, role FROM users WHERE role='admin' LIMIT 1");
  const [members] = await conn.query("SELECT id, role FROM users WHERE role='member' LIMIT 1");
  await conn.end();
  if (!admins.length) { console.log('❌ 无 admin 用户'); process.exit(2); }
  if (!members.length) { console.log('❌ 无 member 用户'); process.exit(2); }
  const admin = admins[0].id, member = members[0].id;
  const adminTok = signJwt('admin', admin);
  const memberTok = signJwt('member', member);

  console.log('\n[1] 公开列表');
  const list0 = await jget('/api/v1/sermons');
  check('GET /sermons 200', list0.status === 200, `status=${list0.status}`);
  check('列表含 items 数组', Array.isArray(list0.body?.items));

  console.log('\n[2] 权限：普通成员不可创建（期望 403）');
  const forbidden = await jsend('POST', '/api/v1/sermons', memberTok, { title: '试图越权' });
  check('成员 POST 403', forbidden.status === 403, `status=${forbidden.status}`);

  console.log('\n[3] 管理员创建讲道 + 系列');
  const seriesRes = await jsend('POST', '/api/v1/sermon-series', adminTok, { title: '罗马书查经', description: '逐章查考', status: 'published' });
  check('POST /sermon-series 200', seriesRes.status === 200, `status=${seriesRes.status}`);
  const seriesId = seriesRes.body?.id;
  const create = await jsend('POST', '/api/v1/sermons', adminTok, {
    seriesId, title: '因信称义', speaker: '张牧师', scripture: '罗马书 3:21-26',
    preachedAt: '2026-09-13', mediaType: 'audio', mediaUrl: 'https://example.com/a.mp3',
    durationSec: 1800, description: '称义的真理', notes: '大纲一\n大纲二', status: 'published',
  });
  check('POST /sermons 200', create.status === 200, `status=${create.status}`);
  const sid = create.body?.id;
  check('返回 id', !!sid);
  check('系列归属正确', create.body?.seriesId === seriesId);
  // 回归：DATE 列必须以 YYYY-MM-DD 出参，不能是 ISO 时间串
  check('preachedAt 为 YYYY-MM-DD', create.body?.preachedAt === '2026-09-13', `got=${create.body?.preachedAt}`);

  console.log('\n[4] 详情 + 浏览计数');
  const detail = await jget(`/api/v1/sermons/${sid}`);
  check('GET 详情 200', detail.status === 200, `status=${detail.status}`);
  check('标题一致', detail.body?.title === '因信称义');
  check('view_count >= 1', (detail.body?.viewCount ?? 0) >= 1, `vc=${detail.body?.viewCount}`);

  console.log('\n[5] 点赞（成员）');
  const like = await jsend('POST', `/api/v1/sermons/${sid}/like`, memberTok);
  check('POST like 200', like.status === 200, `status=${like.status}`);
  const detail2 = await jget(`/api/v1/sermons/${sid}`, memberTok);
  check('like_count = 1', detail2.body?.likeCount === 1, `lc=${detail2.body?.likeCount}`);
  check('liked = true（带登录态）', detail2.body?.liked === true);
  const anon = await jget(`/api/v1/sermons/${sid}`);
  check('匿名 liked = false', anon.body?.liked === false, `got=${anon.body?.liked}`);
  const unlike = await jsend('DELETE', `/api/v1/sermons/${sid}/like`, memberTok);
  check('DELETE like 200', unlike.status === 200, `status=${unlike.status}`);
  const detail3 = await jget(`/api/v1/sermons/${sid}`, memberTok);
  check('like_count = 0', detail3.body?.likeCount === 0, `lc=${detail3.body?.likeCount}`);

  console.log('\n[6] 更新讲道（回归：带 preachedAt 的记录可直接改标题）');
  const upd = await jsend('PATCH', `/api/v1/sermons/${sid}`, adminTok, { title: '因信称义（修订）' });
  check('PATCH 200', upd.status === 200, `status=${upd.status}`);
  check('标题已更新', upd.body?.title === '因信称义（修订）');
  check('preachedAt 未被破坏', upd.body?.preachedAt === '2026-09-13', `got=${upd.body?.preachedAt}`);
  const upd2 = await jsend('PATCH', `/api/v1/sermons/${sid}`, adminTok, { preachedAt: '2026-10-04' });
  check('可改日期', upd2.body?.preachedAt === '2026-10-04', `got=${upd2.body?.preachedAt}`);
  const bad = await jsend('PATCH', `/api/v1/sermons/${sid}`, adminTok, { preachedAt: '不是日期' });
  check('非法日期 422', bad.status === 422, `status=${bad.status}`);

  console.log('\n[7] 列表过滤（按讲员）');
  const flt = await jget(`/api/v1/sermons?speaker=${encodeURIComponent('张牧师')}`);
  check('按讲员命中', (flt.body?.items || []).some((x) => x.id === sid));

  console.log('\n[8] 删除讲道 + 系列');
  const del = await jsend('DELETE', `/api/v1/sermons/${sid}`, adminTok);
  check('DELETE 讲道 200', del.status === 200, `status=${del.status}`);
  const delSeries = await jsend('DELETE', `/api/v1/sermon-series/${seriesId}`, adminTok);
  check('DELETE 系列 200', delSeries.status === 200, `status=${delSeries.status}`);
  const afterDel = await jget(`/api/v1/sermons/${sid}`);
  check('删除后详情 404', afterDel.status === 404, `status=${afterDel.status}`);

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('E2E 异常:', e); process.exit(2); });
