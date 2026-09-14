// 验证：审核员(moderator)权限是否被正确收敛为「仅审核 + 自身」，不残留删除/管理类写权限。
// 权限等级：admin > moderator > member。仅 admin 拥有删除权。
// 运行: BASE=http://127.0.0.1:3200 node scripts/verify-moderator-permissions.mjs
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
  if (c) { pass++; console.log(`  \u2713 ${n}`); }
  else { fail++; console.log(`  \u2717 ${n} ${e}`); }
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
const [[mod]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='moderator' LIMIT 1");
const [[member]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='member' LIMIT 1");
if (!admin || !mod || !member) { console.log('缺少 admin / moderator / member 测试账号，跳过'); await conn.end(); process.exit(1); }
const T_ADMIN = tokenFor(admin), T_MOD = tokenFor(mod), T_MEM = tokenFor(member);
console.log(`admin=${admin.id} moderator=${mod.id} member=${member.id}\n`);

const api = async (method, path, tok, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

// ---------- 硬删他人内容：审核员必须 403，管理员 200 ----------
console.log('【审核员不得硬删他人内容】');
const cid = 'cnt_e2e_' + Math.random().toString(36).slice(2, 12);
await conn.query(
  `INSERT INTO contents (id, author_id, title, body, content_type, status, created_at) VALUES (?,?,?,?,'article','published',NOW())`,
  [cid, member.id, 'E2E 审核员删除测试', '内容正文']
);
const cRes = await api('DELETE', `/contents/${cid}`, T_MOD);
check('审核员删他人内容被拒 (403)', cRes.status === 403, `status=${cRes.status}`);
const cAdm = await api('DELETE', `/contents/${cid}`, T_ADMIN);
check('管理员删他人内容成功 (200)', cAdm.status === 200, `status=${cAdm.status}`);

// 评论（用独立内容，避免上面内容已被级联删除导致外键失败）
const cid2 = 'cnt_e2e_' + Math.random().toString(36).slice(2, 12);
await conn.query(
  `INSERT INTO contents (id, author_id, title, body, content_type, status, created_at) VALUES (?,?,?,?,'article','published',NOW())`,
  [cid2, member.id, 'E2E 审核员删除评论测试', '内容正文2']
);
const cmid = 'cmt_e2e_' + Math.random().toString(36).slice(2, 12);
await conn.query(
  `INSERT INTO comments (id, content_id, user_id, body, created_at) VALUES (?,?,?,?,NOW())`,
  [cmid, cid2, member.id, 'E2E 评论']
);
const cmRes = await api('DELETE', `/contents/${cid2}/comments/${cmid}`, T_MOD);
check('审核员删他人评论被拒 (403)', cmRes.status === 403, `status=${cmRes.status}`);
const cmAdm = await api('DELETE', `/contents/${cid2}/comments/${cmid}`, T_ADMIN);
check('管理员删他人评论成功 (200)', cmAdm.status === 200, `status=${cmAdm.status}`);

// ---------- 管理类写操作：仅 admin ----------
console.log('\n【管理类写操作仅 admin】');
const fid = (sql) => conn.query(sql).then(([r]) => r[0]?.id || null);

const actId = await fid(`SELECT id FROM activities LIMIT 1`);
if (actId) {
  const m = await api('PATCH', '/admin/activities', T_MOD, { activityId: actId, status: 'offline' });
  check('审核员改活动状态被拒 (403)', m.status === 403, `status=${m.status}`);
  const a = await api('PATCH', '/admin/activities', T_ADMIN, { activityId: actId, status: 'offline' });
  check('管理员改活动状态成功 (200)', a.status === 200, `status=${a.status}`);
} else console.log('  - 无活动数据，跳过');

const songId = await fid(`SELECT id FROM songs LIMIT 1`);
if (songId) {
  const m = await api('PATCH', `/admin/songs/${songId}`, T_MOD, { audioType: 'instrumental' });
  check('审核员改诗歌元数据被拒 (403)', m.status === 403, `status=${m.status}`);
  const a = await api('PATCH', `/admin/songs/${songId}`, T_ADMIN, { audioType: 'instrumental' });
  check('管理员改诗歌元数据成功 (200)', a.status === 200, `status=${a.status}`);
} else console.log('  - 无诗歌数据，跳过');

const mediaId = await fid(`SELECT id FROM media_files LIMIT 1`);
if (mediaId) {
  const m = await api('POST', `/admin/media/${mediaId}/reprocess`, T_MOD);
  check('审核员重转码媒体被拒 (403)', m.status === 403, `status=${m.status}`);
  const a = await api('POST', `/admin/media/${mediaId}/reprocess`, T_ADMIN);
  check('管理员重转码媒体被放行 (非 403)', a.status !== 403, `status=${a.status}`);
} else console.log('  - 无媒体数据，跳过');

const q = await api('POST', '/admin/quotas', T_MOD, { all: false, userId: member.id });
check('审核员重算用户画像被拒 (403)', q.status === 403, `status=${q.status}`);
const qa = await api('POST', '/admin/quotas', T_ADMIN, { all: false, userId: member.id });
check('管理员重算用户画像成功 (200)', qa.status === 200, `status=${qa.status}`);

// ---------- 审核本职：审核员必须可用（不能误锁） ----------
console.log('\n【审核本职：审核员保持可用】');
const orgId = await fid(`SELECT id FROM organizations LIMIT 1`);
if (orgId) {
  const m = await api('PATCH', '/admin/organizations', T_MOD, { orgId, status: 'approved' });
  check('审核员审核组织通过 (200)', m.status === 200, `status=${m.status}`);
} else console.log('  - 无组织数据，跳过');

if (mediaId) {
  const m = await api('POST', `/admin/media/${mediaId}/review`, T_MOD, { action: 'approve' });
  check('审核员审核媒体 (200 或 已审)', m.status === 200 || m.status === 409, `status=${m.status}`);
}

const taskId = await fid(`SELECT id FROM review_tasks WHERE status='pending' LIMIT 1`);
if (taskId) {
  const m = await api('POST', `/moderation/${taskId}/action`, T_MOD, { action: 'approve' });
  check('审核员通过审核任务 (200)', m.status === 200, `status=${m.status}`);
} else console.log('  - 无待审任务，跳过审核任务用例');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await conn.end();
process.exit(fail ? 1 : 0);
