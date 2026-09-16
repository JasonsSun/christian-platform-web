// 后台「内容 / 评论 / 标签」治理接口的端到端回归。
// 运行: BASE=http://127.0.0.1:3996 node scripts/verify-admin-governance.mjs
//
// 用管理员 JWT 直接打接口（比走登录页省事，登录要过验证码）。
// 覆盖：列表返回结构、状态筛选、批量上下架、评论删除后计数回写、标签改写，最后清理现场。
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3996';

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
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
const [[admin]] = await conn.query(
  "SELECT id, role FROM users WHERE status='active' AND role='admin' ORDER BY created_at LIMIT 1"
);
const TOKEN = signJwt(
  { sub: admin.id, role: admin.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 3600 },
  env.JWT_SECRET
);

const call = async (method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { /* 非 JSON */ }
  // ok() 直接返回业务对象，没有 {data} 外层
  return { status: r.status, json: j ?? j, raw: t, data: j?.data ?? j };
};

console.log('=== A. 内容管理 /admin/contents ===');
const listAll = await call('GET', '/api/v1/admin/contents?pageSize=5');
check('列表 200', listAll.status === 200, String(listAll.status));
check('返回 items 数组', Array.isArray(listAll.data?.items), JSON.stringify(listAll.data).slice(0, 120));
check('返回 total 与 statusCounts', typeof listAll.data?.total === 'number' && !!listAll.data?.statusCounts);
check('每条含 author 对象', !!listAll.data?.items?.[0]?.author?.displayName, JSON.stringify(listAll.data?.items?.[0] || {}).slice(0, 160));

const listPublished = await call('GET', '/api/v1/admin/contents?status=published&pageSize=5');
const allPublished = (listPublished.data?.items || []).every((c) => c.status === 'published');
check('状态筛选生效（published）', listPublished.status === 200 && allPublished);

const listKw = await call('GET', '/api/v1/admin/contents?q=' + encodeURIComponent('诗篇') + '&pageSize=5');
check('关键词搜索不报错', listKw.status === 200, String(listKw.status));

// 造一条内容用于状态流转与删除，避免动真实数据
const tmpTitle = `[e2e] 治理回归临时内容 ${Date.now()}`;
const [ins] = await conn.query(
  `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover,
                         like_count, comment_count, view_count, created_at)
   VALUES (?, ?, ?, ?, 'article', 'draft', 'global', '', ?, '📖', 0, 0, 0, NOW())`,
  ['cnt_e2e_gov_' + Date.now(), admin.id, tmpTitle, '回归用正文', 'e2e,回归']
);
const tmpId = 'cnt_e2e_gov_' + Date.now();
await conn.query(`UPDATE contents SET id = ? WHERE title = ?`, [tmpId, tmpTitle]).catch(() => {});
const contentId = (await conn.query(`SELECT id FROM contents WHERE title = ?`, [tmpTitle]))[0][0]?.id;
check('临时内容已创建', !!contentId, String(ins?.insertId));

const toPub = await call('PATCH', '/api/v1/admin/contents', { ids: [contentId], status: 'published' });
check('批量上架 200', toPub.status === 200 && toPub.data?.updated === 1, JSON.stringify(toPub.data));
const [[afterPub]] = await conn.query(`SELECT status, published_at FROM contents WHERE id = ?`, [contentId]);
check('数据库状态已变为 published', afterPub.status === 'published', afterPub.status);
check('上架补齐 published_at', !!afterPub.published_at, String(afterPub.published_at));

const toRej = await call('PATCH', '/api/v1/admin/contents', { ids: [contentId], status: 'rejected' });
const [[afterRej]] = await conn.query(`SELECT status, published_at FROM contents WHERE id = ?`, [contentId]);
check('批量下架生效', toRej.status === 200 && afterRej.status === 'rejected', afterRej.status);
check('下架清空 published_at', afterRej.published_at === null, String(afterRej.published_at));

const badStatus = await call('PATCH', '/api/v1/admin/contents', { ids: [contentId], status: 'nope' });
check('非法状态被拒（422）', badStatus.status === 422, String(badStatus.status));
const noIds = await call('PATCH', '/api/v1/admin/contents', { ids: [], status: 'published' });
check('空 ids 被拒（422）', noIds.status === 422, String(noIds.status));

console.log('\n=== B. 评论管理 /admin/comments ===');
const cmList = await call('GET', '/api/v1/admin/comments?pageSize=5');
check('列表 200', cmList.status === 200, String(cmList.status));
check('返回 items 与 total', Array.isArray(cmList.data?.items) && typeof cmList.data?.total === 'number');

// 给临时内容插两条评论，验证删除与计数回写
await conn.query(
  `INSERT INTO comments (id, content_id, user_id, body, created_at) VALUES (?, ?, ?, ?, NOW()), (?, ?, ?, ?, NOW())`,
  ['cmt_e2e_a' + Date.now(), contentId, admin.id, '回归评论 A', 'cmt_e2e_b' + Date.now(), contentId, admin.id, '回归评论 B']
);
await conn.query(`UPDATE contents SET comment_count = 2 WHERE id = ?`, [contentId]);
const [[beforeDel]] = await conn.query(`SELECT comment_count FROM contents WHERE id = ?`, [contentId]);
check('删除前评论数为 2', Number(beforeDel.comment_count) === 2, String(beforeDel.comment_count));

const cmIds = (await conn.query(`SELECT id FROM comments WHERE content_id = ?`, [contentId]))[0].map((r) => r.id);
const cmDel = await call('DELETE', `/api/v1/admin/comments?ids=${cmIds.join(',')}`);
check('删除评论 200', cmDel.status === 200 && cmDel.data?.deleted === 2, JSON.stringify(cmDel.data));
const [[afterDel]] = await conn.query(`SELECT comment_count FROM contents WHERE id = ?`, [contentId]);
check('删除后评论数归零（计数回写）', Number(afterDel.comment_count) === 0, String(afterDel.comment_count));
const cmNoIds = await call('DELETE', '/api/v1/admin/comments?ids=');
check('空 ids 删除被拒（422）', cmNoIds.status === 422, String(cmNoIds.status));

console.log('\n=== C. 标签管理 /admin/tags ===');
const tagList = await call('GET', '/api/v1/admin/tags');
check('列表 200', tagList.status === 200, String(tagList.status));
const hasE2e = (tagList.data?.items || []).some((t) => t.name === 'e2e');
check('聚合出临时内容的标签 e2e', hasE2e, JSON.stringify((tagList.data?.items || []).slice(0, 5)));

const renamed = await call('PATCH', '/api/v1/admin/tags', { op: 'rename', from: ['e2e'], to: 'e2e-renamed' });
check('重命名标签 200', renamed.status === 200, JSON.stringify(renamed.data));
const [[afterRename]] = await conn.query(`SELECT tags FROM contents WHERE id = ?`, [contentId]);
check('内容标签已改写', String(afterRename.tags).includes('e2e-renamed') && !String(afterRename.tags).includes('e2e,'), afterRename.tags);

const merged = await call('PATCH', '/api/v1/admin/tags', { op: 'merge', from: ['e2e-renamed', '回归'], to: '回归合并' });
check('合并标签 200', merged.status === 200, JSON.stringify(merged.data));
const [[afterMerge]] = await conn.query(`SELECT tags FROM contents WHERE id = ?`, [contentId]);
check('合并后仅剩目标标签', !String(afterMerge.tags).includes('e2e-renamed'), afterMerge.tags);

const tagDel = await call('PATCH', '/api/v1/admin/tags', { op: 'delete', from: ['回归合并'] });
check('删除标签 200', tagDel.status === 200, JSON.stringify(tagDel.data));
const [[afterTagDel]] = await conn.query(`SELECT tags FROM contents WHERE id = ?`, [contentId]);
check('删除后标签字段清空', !String(afterTagDel.tags || '').includes('回归合并'), String(afterTagDel.tags));

const badOp = await call('PATCH', '/api/v1/admin/tags', { op: 'nope', from: ['x'] });
check('非法操作被拒（422）', badOp.status === 422, String(badOp.status));

console.log('\n=== D. 清理 ===');
await conn.query(`DELETE FROM contents WHERE id = ?`, [contentId]);
const [[gone]] = await conn.query(`SELECT COUNT(*) AS c FROM contents WHERE id = ?`, [contentId]);
check('临时内容已清理', Number(gone.c) === 0);
await conn.end();

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
