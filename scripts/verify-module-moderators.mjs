// 验证「模块审核员」体系：
//   1) 权限等级 admin > 模块审核员(moderator + scope) > 普通成员
//   2) 审核员只能在自己被分配的模块里治理（含删除下放），越模块一律 403
//   3) 无任何模块的审核员 = 无治理权
//   4) 每张能单独发出的模块牌都管得到对应治理入口（评论牌 = 评论管理页）
//   5) 治理团队公示接口公开可见；管理层私信对普通成员 403
//
// 运行: BASE=http://127.0.0.1:3200 node scripts/verify-module-moderators.mjs
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

const rand = () => Math.random().toString(36).slice(2, 10);
const mkUser = async (username, role) => {
  const id = 'usr_e2e_' + rand();
  await conn.query(
    `INSERT INTO users (id, username, email, password_hash, display_name, role, status,
                        avatar_color, bio, city, region, church, created_at)
     VALUES (?,?,?,?,?,?, 'active', '#4f6df5','','','CN','',NOW())`,
    [id, username, `${username}@e2e.local`, 'x', username, role]
  );
  return { id, role, username };
};
const setScopes = async (userId, modules) => {
  await conn.query(`DELETE FROM moderator_scopes WHERE user_id = ?`, [userId]);
  for (const m of modules) {
    await conn.query(
      `INSERT INTO moderator_scopes (user_id, module, assigned_by, assigned_at) VALUES (?,?,NULL,NOW())`,
      [userId, m]
    );
  }
};

const [[admin]] = await conn.query("SELECT id, role FROM users WHERE status='active' AND role='admin' LIMIT 1");
if (!admin) { console.log('缺少 admin 账号'); await conn.end(); process.exit(1); }

// 上一趟跑到一半崩了就不走到清理，这些 e2e_ 账号会留在库里：它们都带模块授权，
// 会出现在社区页的治理团队公示里。开跑前先扫一遍，别让一次崩溃留下常驻的假审核员。
const [[stale]] = await conn.query(
  `SELECT GROUP_CONCAT(id) AS ids, COUNT(*) AS n FROM users WHERE username LIKE 'e2e\\_%'`
);
if (Number(stale.n) > 0) {
  await conn.query(`DELETE FROM users WHERE username LIKE 'e2e\\_%'`);
  console.log(`先清掉上一趟崩溃残留的 ${stale.n} 个 e2e 账号`);
}

const member = await mkUser('e2e_member_' + rand(), 'member');
const prayersMod = await mkUser('e2e_prayers_' + rand(), 'moderator');
const contentMod = await mkUser('e2e_content_' + rand(), 'moderator');
const commentMod = await mkUser('e2e_comment_' + rand(), 'moderator');
const noScopeMod = await mkUser('e2e_noscope_' + rand(), 'moderator');
await setScopes(prayersMod.id, ['prayers']);
await setScopes(contentMod.id, ['contents', 'comments']);
await setScopes(commentMod.id, ['comments']);
await setScopes(noScopeMod.id, []);

const T_ADMIN = tokenFor(admin);
const T_MEM = tokenFor(member);
const T_PRAY = tokenFor(prayersMod);
const T_CONT = tokenFor(contentMod);
const T_CMT = tokenFor(commentMod);
const T_NONE = tokenFor(noScopeMod);

const api = async (method, path, tok, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

const mkPrayer = async (authorId) => {
  const id = 'pry_e2e_' + rand();
  await conn.query(
    `INSERT INTO prayers (id, user_id, body, amen_count, answered, created_at) VALUES (?,?,?,0,0,NOW())`,
    [id, authorId, 'E2E 代祷']
  );
  return id;
};
const mkContent = async (authorId, title) => {
  const id = 'cnt_e2e_' + rand();
  await conn.query(
    `INSERT INTO contents (id, author_id, title, body, content_type, status, created_at)
     VALUES (?,?,?,?,'article','published',NOW())`,
    [id, authorId, title, 'E2E 正文']
  );
  return id;
};

console.log('【模块删除权下放：只能删自己负责的模块】');
const p1 = await mkPrayer(member.id);
check('代祷模块审核员可删他人代祷 (200)', (await api('DELETE', `/prayers/${p1}`, T_PRAY)).status === 200);
const p2 = await mkPrayer(member.id);
check('文章模块审核员删代祷被拒 (403)', (await api('DELETE', `/prayers/${p2}`, T_CONT)).status === 403);
const p3 = await mkPrayer(member.id);
check('无模块审核员删代祷被拒 (403)', (await api('DELETE', `/prayers/${p3}`, T_NONE)).status === 403);
const p4 = await mkPrayer(member.id);
check('管理员删代祷成功 (200)', (await api('DELETE', `/prayers/${p4}`, T_ADMIN)).status === 200);

const c1 = await mkContent(member.id, 'E2E 文章模块');
check('文章模块审核员可删他人文章 (200)', (await api('DELETE', `/contents/${c1}`, T_CONT)).status === 200);
const c2 = await mkContent(member.id, 'E2E 代祷模块越权');
check('代祷模块审核员删文章被拒 (403)', (await api('DELETE', `/contents/${c2}`, T_PRAY)).status === 403);
const c3 = await mkContent(member.id, 'E2E 管理员删文章');
check('管理员删文章成功 (200)', (await api('DELETE', `/contents/${c3}`, T_ADMIN)).status === 200);

console.log('\n【后台菜单/列表按模块范围可见】');
check('代祷审核员可看代祷管理 (200)', (await api('GET', '/admin/prayers', T_PRAY)).status === 200);
check('代祷审核员不可看媒体中心 (403)', (await api('GET', '/admin/media', T_PRAY)).status === 403);
check('文章审核员可看内容审核队列 (200)', (await api('GET', '/moderation/queue', T_CONT)).status === 200);
check('无模块审核员不可看代祷管理 (403)', (await api('GET', '/admin/prayers', T_NONE)).status === 403);
check('管理员可看媒体中心 (200)', (await api('GET', '/admin/media', T_ADMIN)).status === 200);
check('普通成员不可看后台 (403)', (await api('GET', '/admin/prayers', T_MEM)).status === 403);

// 「评论」是一张可以单独发出的牌（权限中心能勾、治理团队页也公示），
// 那它就必须真管得到评论治理那一页；只认 contents 时这张牌发出去是空的。
console.log('\n【评论模块单独发牌也管得到评论治理】');
const cmtGet = await api('GET', '/admin/comments', T_CMT);
check('评论审核员可看评论管理 (200)', cmtGet.status === 200, `status=${cmtGet.status}`);
check('兼任评论+文章的审核员可看评论管理 (200)', (await api('GET', '/admin/comments', T_CONT)).status === 200);
check('代祷审核员不可看评论管理 (403)', (await api('GET', '/admin/comments', T_PRAY)).status === 403);
check('无模块审核员不可看评论管理 (403)', (await api('GET', '/admin/comments', T_NONE)).status === 403);
const cmtDel = await api('DELETE', '/admin/comments', T_CMT);
check('评论审核员能过守卫（没选评论报 422，而不是 403）', cmtDel.status === 422, `status=${cmtDel.status}`);
const cmtDelNo = await api('DELETE', '/admin/comments', T_PRAY);
check('代祷审核员删评论仍被拒 (403)', cmtDelNo.status === 403, `status=${cmtDelNo.status}`);

console.log('\n【系统治理权仍仅管理员】');
check('文章审核员不可看用户管理 (403)', (await api('GET', '/admin/users', T_CONT)).status === 403);
check('文章审核员不可看权限中心 (403)', (await api('GET', '/admin/roles', T_CONT)).status === 403);
check('管理员可看权限中心 (200)', (await api('GET', '/admin/roles', T_ADMIN)).status === 200);
const scopePatch = await api('PATCH', '/admin/roles', T_CONT, { userId: member.id, modules: ['prayers'] });
check('审核员不可分配模块范围 (403)', scopePatch.status === 403, `status=${scopePatch.status}`);

console.log('\n【/auth/me 下发模块范围】');
const mePray = await api('GET', '/auth/me', T_PRAY);
check('代祷审核员 scopes = [prayers]', JSON.stringify(mePray.json?.moderatorScopes) === '["prayers"]',
  `got=${JSON.stringify(mePray.json?.moderatorScopes)}`);
const meAdmin = await api('GET', '/auth/me', T_ADMIN);
check('管理员 scopes 覆盖全部 11 个模块', (meAdmin.json?.moderatorScopes || []).length === 11,
  `len=${(meAdmin.json?.moderatorScopes || []).length}`);

console.log('\n【治理团队公示（公开接口）】');
const team = await api('GET', '/moderation/team', null);
check('未登录也能读取治理团队 (200)', team.status === 200, `status=${team.status}`);
check('返回 11 个模块', (team.json?.modules || []).length === 11, `len=${(team.json?.modules || []).length}`);
check('返回管理员名单', Array.isArray(team.json?.admins) && team.json.admins.length >= 1);
const prayersBox = (team.json?.modules || []).find((m) => m.key === 'prayers');
check('代祷模块框里含该模块审核员',
  (prayersBox?.moderators || []).some((m) => m.id === prayersMod.id));
const contentBox = (team.json?.modules || []).find((m) => m.key === 'contents');
check('兼任两模块的审核员出现在各自模块框',
  !(contentBox?.moderators || []).some((m) => m.id === prayersMod.id) &&
  (contentBox?.moderators || []).some((m) => m.id === contentMod.id));
const commentsBox = (team.json?.modules || []).find((m) => m.key === 'comments');
check('公示在「评论互动」名下的人，评论管理确实点得开',
  (commentsBox?.moderators || []).some((m) => m.id === commentMod.id) && cmtGet.status === 200);

console.log('\n【管理层私信：普通成员完全隔离】');
check('普通成员读管理消息被拒 (403)', (await api('GET', '/admin/messages', T_MEM)).status === 403);
const inbox = await api('GET', '/admin/messages', T_PRAY);
check('模块审核员可读管理消息 (200)', inbox.status === 200, `status=${inbox.status}`);
const sent = await api('POST', '/admin/messages', T_PRAY, { toId: admin.id, body: 'E2E 管理消息' });
check('审核员可发消息给管理员 (201)', sent.status === 201, `status=${sent.status}`);
const toMember = await api('POST', '/admin/messages', T_PRAY, { toId: member.id, body: '越权测试' });
check('不能把管理消息发给普通成员 (403)', toMember.status === 403, `status=${toMember.status}`);
const thread = await api('GET', `/admin/messages/${admin.id}`, T_ADMIN);
check('管理员可读取该会话 (200)', thread.status === 200, `status=${thread.status}`);

// 清理
await conn.query(`DELETE FROM staff_messages WHERE from_id IN (?,?) OR to_id IN (?,?)`,
  [prayersMod.id, admin.id, prayersMod.id, admin.id]);
await conn.query(`DELETE FROM users WHERE id IN (?,?,?,?,?)`,
  [member.id, prayersMod.id, contentMod.id, commentMod.id, noScopeMod.id]);
await conn.end();

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
