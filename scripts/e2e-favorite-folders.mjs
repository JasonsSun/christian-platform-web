// 收藏分类 e2e：运行时建表/加列 / 未登录 401 / 新建(重名 409、空名 422) /
// 收藏+批量移动 / 按分类筛选 / 移回未分类 / 删除分类后收藏退回未分类且不丢 /
// 他人分类 403 / 未收藏内容移动返回 0。
// 用法：BASE=http://127.0.0.1:3200 node scripts/e2e-favorite-folders.mjs
import mysql from 'mysql2/promise';
import fs from 'fs';
import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const b64 = (s) => Buffer.from(s).toString('base64url');
const signJwt = (payload, secret) => {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
};

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

async function tokenOf(userId, role) {
  return signJwt({ sub: userId, role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 }, env.JWT_SECRET);
}
async function api(method, path, token, body) {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const [users] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='member' LIMIT 2"
);
if (users.length < 2) throw new Error('need at least 2 active members');
const A = String(users[0].id);
const B = String(users[1].id);
const TA = await tokenOf(A, 'member');
const TB = await tokenOf(B, 'member');

const [contents] = await conn.query("SELECT id FROM contents WHERE status='published' LIMIT 2");
if (contents.length < 2) throw new Error('need at least 2 published contents');
const C1 = String(contents[0].id);
const C2 = String(contents[1].id);

const FOLDER = '收藏测试分类';
const FOLDER2 = '收藏测试分类B';
const cleanup = async () => {
  // 首次运行时 favorite_folders 还没被 ensure 出来，容错跳过
  try {
    await conn.query("DELETE FROM favorite_folders WHERE user_id IN (?,?) AND name LIKE '收藏测试%'", [A, B]);
  } catch {}
  await conn.query('DELETE FROM content_favorites WHERE user_id IN (?,?) AND content_id IN (?,?)', [A, B, C1, C2]);
};
await cleanup();

// 冷启动重试
for (let i = 0; i < 40; i++) {
  const r = await api('GET', '/me/favorite-folders', TA);
  if (r.status !== 404) break;
  await new Promise((r2) => setTimeout(r2, 500));
}

console.log('\n[e2e] 收藏分类');

/* 1. 未登录 */
{
  const a = await api('GET', '/me/favorites', null);
  const b = await api('GET', '/me/favorite-folders', null);
  check('未登录 /me/favorites 401', a.status === 401, `status=${a.status}`);
  check('未登录 /me/favorite-folders 401', b.status === 401, `status=${b.status}`);
}

/* 2. 运行时建表 + 加列 */
let folderId = '';
let folder2Id = '';
{
  const [t] = await conn.query("SHOW TABLES LIKE 'favorite_folders'");
  check('favorite_folders 表已建', Array.isArray(t) && t.length === 1);
  const [cols] = await conn.query(
    "SHOW COLUMNS FROM content_favorites LIKE 'folder_id'"
  );
  check('content_favorites 已加 folder_id 列', Array.isArray(cols) && cols.length === 1);

  const r = await api('GET', '/me/favorite-folders', TA);
  check('分类列表返回 200', r.status === 200, `status=${r.status}`);
  check('返回 folders/unfiled/total 结构', Array.isArray(r.data?.folders) && typeof r.data?.unfiled === 'number' && typeof r.data?.total === 'number');
}

/* 3. 新建分类 */
{
  const bad = await api('POST', '/me/favorite-folders', TA, { name: '  ' });
  check('空名返回 422', bad.status === 422, `status=${bad.status}`);

  const r = await api('POST', '/me/favorite-folders', TA, { name: FOLDER });
  check('新建分类返回 201', r.status === 201, `status=${r.status}`);
  folderId = r.data?.folder?.id || '';
  check('返回新分类 id', !!folderId);

  const dup = await api('POST', '/me/favorite-folders', TA, { name: FOLDER });
  check('重名返回 409', dup.status === 409, `status=${dup.status}`);

  const r2 = await api('POST', '/me/favorite-folders', TA, { name: FOLDER2, color: 'gold' });
  folder2Id = r2.data?.folder?.id || '';
  check('新建第二个分类成功', r2.status === 201 && !!folder2Id);

  const list = await api('GET', '/me/favorite-folders', TA);
  check('列表含两个新分类且计数为 0', list.data?.folders?.filter((f) => f.id === folderId || f.id === folder2Id).every((f) => f.count === 0));
}

/* 4. 收藏 + 批量移动 */
{
  const f1 = await api('POST', `/contents/${C1}/favorite`, TA);
  const f2 = await api('POST', `/contents/${C2}/favorite`, TA);
  check('收藏两篇内容成功', f1.data?.favorited === true && f2.data?.favorited === true);

  const all = await api('GET', '/me/favorites?folder=all', TA);
  check('收藏列表含这两篇', (all.data?.items || []).length >= 2, `len=${(all.data?.items || []).length}`);

  const mv = await api('PATCH', '/me/favorites', TA, { contentIds: [C1, C2], folderId });
  check('批量移动返回 changed=2', mv.data?.changed === 2, `changed=${mv.data?.changed}`);

  const inFolder = await api('GET', `/me/favorites?folder=${folderId}`, TA);
  check('按分类筛选命中 2 条', (inFolder.data?.items || []).length === 2, `len=${(inFolder.data?.items || []).length}`);
  check('命中项 folderId 正确', (inFolder.data?.items || []).every((x) => x.folderId === folderId));

  const un = await api('GET', '/me/favorites?folder=unfiled', TA);
  check('未分类此时为 0', (un.data?.items || []).length === 0, `len=${(un.data?.items || []).length}`);

  const cnt = await api('GET', '/me/favorite-folders', TA);
  check('分类计数更新为 2', cnt.data?.folders?.find((f) => f.id === folderId)?.count === 2);
}

/* 5. 换分类 + 移回未分类 */
{
  const mv2 = await api('PATCH', '/me/favorites', TA, { contentIds: [C1], folderId: folder2Id });
  check('移动到另一分类 changed=1', mv2.data?.changed === 1);
  const a = await api('GET', `/me/favorites?folder=${folderId}`, TA);
  const b = await api('GET', `/me/favorites?folder=${folder2Id}`, TA);
  check('两个分类各 1 条', (a.data?.items || []).length === 1 && (b.data?.items || []).length === 1);

  const back = await api('PATCH', '/me/favorites', TA, { contentIds: [C1, C2], folderId: null });
  check('移回未分类 changed=2', back.data?.changed === 2, `changed=${back.data?.changed}`);
  const un = await api('GET', '/me/favorites?folder=unfiled', TA);
  check('未分类恢复为 2 条', (un.data?.items || []).length === 2, `len=${(un.data?.items || []).length}`);
}

/* 6. 越权与异常输入 */
{
  const other = await api('PATCH', '/me/favorites', TB, { contentIds: [C1], folderId });
  check('他人操作我的分类返回 403', other.status === 403, `status=${other.status}`);

  const del = await api('DELETE', `/me/favorite-folders/${folderId}`, TB);
  check('他人删除我的分类返回 403', del.status === 403, `status=${del.status}`);

  const empty = await api('PATCH', '/me/favorites', TA, { contentIds: [], folderId });
  check('空 contentIds 返回 422', empty.status === 422, `status=${empty.status}`);

  const ghost = await api('PATCH', '/me/favorites', TA, { contentIds: ['not-collected-xxx'], folderId });
  check('移动未收藏内容 changed=0', ghost.data?.changed === 0, `changed=${ghost.data?.changed}`);

  const nf = await api('DELETE', '/me/favorite-folders/不存在的分类ID', TA);
  check('删除不存在分类返回 404', nf.status === 404, `status=${nf.status}`);
}

/* 7. 删除分类：收藏退回未分类且不丢 */
{
  const before = await api('GET', '/me/favorites?folder=all', TA);
  const n = (before.data?.items || []).length;

  await api('PATCH', '/me/favorites', TA, { contentIds: [C1], folderId });
  const del = await api('DELETE', `/me/favorite-folders/${folderId}`, TA);
  check('删除分类返回 200', del.status === 200, `status=${del.status}`);
  check('分类已从列表移除', !(del.data?.folders || []).some((f) => f.id === folderId));

  const after = await api('GET', '/me/favorites?folder=all', TA);
  check('收藏总数不因删分类而减少', (after.data?.items || []).length === n, `before=${n} after=${(after.data?.items || []).length}`);
  const un = await api('GET', '/me/favorites?folder=unfiled', TA);
  check('原分类内容退回未分类', (un.data?.items || []).length === 2, `len=${(un.data?.items || []).length}`);
}

await cleanup();
await conn.end();

console.log(`\n[e2e] 结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
