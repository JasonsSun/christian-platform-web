// E2E 验证：5 个剩余明确缺口的行为正确性（API 级）
//   1) 群聊：成员可发/可拉；非成员拉取被拒(403)
//   2) 群公告：团长可改；非团长被拒(403)；GET 回读生效
//   3) 活动地图：详情返回 lat/lng；组织者 PATCH 坐标落库
//   4) 备份管理：仅管理员可读/创建；成员读被拒(403)；创建后文件出现
//   5) 私信隐私：allow_dm=none / followers(未关注) / 拉黑 一律 403；关注后或 everyone 可发
// 运行: BASE=http://127.0.0.1:3200 node scripts/e2e-features-5.mjs
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
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

let pass = 0, fail = 0;
const check = (n, c, e = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n} ${e}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});

const pick = async (role) => {
  const [rows] = await conn.query(
    `SELECT id, role FROM users WHERE status='active'${role ? ` AND role='${role}'` : ''} LIMIT 6`
  );
  return rows;
};
const members = await pick('member');
const admins = await pick('admin');
if (members.length < 3) { console.log('需要至少 3 个 active member 账号'); await conn.end(); process.exit(1); }
if (!admins.length) { console.log('需要至少 1 个 admin 账号'); await conn.end(); process.exit(1); }

const [A, B, C] = members; // A=群主/私信发送方, B=群成员/私信接收方, C=群外
const admin = admins[0];
const tok = (u) => signJwt(
  { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 1800 },
  env.JWT_SECRET
);
const T = { A: tok(A), B: tok(B), C: tok(C), admin: tok(admin) };

const api = async (method, path, t, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  const payload = j?.data ?? j ?? {};
  return { status: res.status, data: payload, code: j?.code ?? payload?.code, message: j?.message ?? payload?.message };
};

const created = []; // 清理清单: { table, id }
const track = (table, id) => created.push({ table, id });

try {
  // ===== 1) 群聊 + 2) 群公告 =====
  const gid = uid();
  await conn.query(
    `INSERT INTO \`groups\` (id, name, description, category, owner_id, created_at) VALUES (?,?,?,?,?,?)`,
    [gid, 'E2E测试群', 'auto', 'fellowship', A.id, now()]
  );
  await conn.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`, [gid, A.id, 'owner', now()]);
  await conn.query(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`, [gid, B.id, 'member', now()]);
  track('groups', gid);

  console.log('\n【1】群聊：成员可发/拉，非成员被拒');
  const post = await api('POST', `/groups/${gid}/chat`, T.B, { content: 'e2e hello' });
  check('群成员发消息 201', post.status === 201, `status=${post.status}`);
  const list = await api('GET', `/groups/${gid}/chat`, T.B);
  check('群成员拉取消息 200', list.status === 200, `status=${list.status}`);
  check('消息内容回读正确', (list.data?.messages || []).some((m) => m.content === 'e2e hello'), JSON.stringify(list.data));
  const out = await api('GET', `/groups/${gid}/chat`, T.C);
  check('群外用户拉取被拒 403', out.status === 403, `status=${out.status}`);

  console.log('\n【2】群公告：团长可改，非团长被拒');
  const annOk = await api('PATCH', `/groups/${gid}`, T.A, { announcement: '欢迎来到测试群' });
  check('团长设置公告 200', annOk.status === 200, `status=${annOk.status}`);
  const gDetail = await api('GET', `/groups/${gid}`, T.B);
  check('公告回读生效', gDetail.data?.announcement === '欢迎来到测试群', JSON.stringify(gDetail.data));
  const annNo = await api('PATCH', `/groups/${gid}`, T.B, { announcement: 'hack' });
  check('非团长改公告被拒 403', annNo.status === 403, `status=${annNo.status}`);

  // ===== 3) 活动地图 =====
  console.log('\n【3】活动地图：详情返回坐标，组织者可改');
  const aid = uid();
  await conn.query(
    `INSERT INTO activities (id, organizer_id, title, description, category, location, city, lat, lng, start_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [aid, A.id, 'E2E活动', 'auto', 'fellowship', '测试地点', '北京', 39.9042, 116.4074, now(), now()]
  );
  track('activities', aid);
  const act = await api('GET', `/activities/${aid}`, T.B);
  check('活动详情返回 lat', Math.abs(Number(act.data?.lat) - 39.9042) < 1e-4, `lat=${act.data?.lat}`);
  check('活动详情返回 lng', Math.abs(Number(act.data?.lng) - 116.4074) < 1e-4, `lng=${act.data?.lng}`);
  const patchLoc = await api('PATCH', `/activities/${aid}`, T.A, { lat: 31.2304, lng: 121.4737 });
  check('组织者改坐标 200', patchLoc.status === 200, `status=${patchLoc.status}`);
  const act2 = await api('GET', `/activities/${aid}`, T.B);
  check('新坐标回读生效', Math.abs(Number(act2.data?.lat) - 31.2304) < 1e-4 && Math.abs(Number(act2.data?.lng) - 121.4737) < 1e-4, JSON.stringify(act2.data));
  const patchLocNo = await api('PATCH', `/activities/${aid}`, T.B, { lat: 0, lng: 0 });
  check('非组织者改坐标被拒 403', patchLocNo.status === 403, `status=${patchLocNo.status}`);

  // ===== 4) 备份管理 =====
  console.log('\n【4】备份管理：仅管理员可访问');
  const bkList = await api('GET', '/admin/backups', T.admin);
  check('管理员读备份列表 200', bkList.status === 200, `status=${bkList.status}`);
  check('备份列表含 files 数组', Array.isArray(bkList.data?.files), JSON.stringify(bkList.data));
  const bkDeny = await api('GET', '/admin/backups', T.B);
  check('普通成员读备份被拒 403', bkDeny.status === 403, `status=${bkDeny.status}`);
  const bkCreate = await api('POST', '/admin/backups', T.admin);
  check('管理员创建应用备份 200/201', bkCreate.status === 200 || bkCreate.status === 201, `status=${bkCreate.status}`);
  if (bkCreate.status === 200 && bkCreate.data?.name) {
    track('db_backups_name', bkCreate.data.name);
    const after = await api('GET', '/admin/backups', T.admin);
    check('新备份出现在列表', (after.data?.files || []).some((f) => f.name === bkCreate.data.name), JSON.stringify(after.data?.files));
  }

  // ===== 5) 私信隐私 =====
  console.log('\n【5】私信隐私策略');
  // 还原 allow_dm / 关注 / 拉黑 状态，避免与既有数据冲突
  await conn.query(`UPDATE users SET allow_dm='everyone' WHERE id=?`, [B.id]);
  await conn.query(`DELETE FROM follows WHERE follower_id=? AND followee_id=?`, [A.id, B.id]);
  await conn.query(`DELETE FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)`, [A.id, B.id, B.id, A.id]);

  // 5.1 none
  await conn.query(`UPDATE users SET allow_dm='none' WHERE id=?`, [B.id]);
  const dmNone = await api('POST', `/messages/${B.id}`, T.A, { body: 'hi' });
  check('allow_dm=none 时私信被拒 403', dmNone.status === 403, `status=${dmNone.status} ${dmNone.message || ''}`);

  // 5.2 followers 但未关注
  await conn.query(`UPDATE users SET allow_dm='followers' WHERE id=?`, [B.id]);
  const dmF0 = await api('POST', `/messages/${B.id}`, T.A, { body: 'hi' });
  check('allow_dm=followers 且未关注被拒 403', dmF0.status === 403, `status=${dmF0.status}`);

  // 5.3 followers 且已关注
  await conn.query(`INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)`, [A.id, B.id, now()]);
  const dmF1 = await api('POST', `/messages/${B.id}`, T.A, { body: 'hi follower' });
  check('allow_dm=followers 且已关注可发 201', dmF1.status === 201, `status=${dmF1.status}`);

  // 5.4 拉黑
  await conn.query(`INSERT INTO user_blocks (id, blocker_id, blocked_id, created_at) VALUES (?,?,?,?)`, [uid(), A.id, B.id, now()]);
  const dmBlock = await api('POST', `/messages/${B.id}`, T.A, { body: 'hi' });
  check('被拉黑后私信被拒 403', dmBlock.status === 403, `status=${dmBlock.status} ${dmBlock.message || ''}`);

  // 5.5 everyone（恢复默认）
  await conn.query(`DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?`, [A.id, B.id]);
  await conn.query(`UPDATE users SET allow_dm='everyone' WHERE id=?`, [B.id]);
  const dmAll = await api('POST', `/messages/${B.id}`, T.A, { body: 'hi all' });
  check('allow_dm=everyone 可发 201', dmAll.status === 201, `status=${dmAll.status}`);

  // 5.6 PATCH allow_dm 落库
  const setDm = await api('PATCH', '/auth/me', T.B, { allowDm: 'none' });
  check('PATCH /auth/me 设 allowDm 200', setDm.status === 200, `status=${setDm.status}`);
  const [[row]] = await conn.query(`SELECT allow_dm FROM users WHERE id=?`, [B.id]);
  check('allow_dm 落库为 none', row?.allow_dm === 'none', `actual=${row?.allow_dm}`);
  await conn.query(`UPDATE users SET allow_dm='everyone' WHERE id=?`, [B.id]);

} finally {
  // 清理测试数据
  for (const c of created) {
    try {
      if (c.table === 'db_backups_name') {
        await conn.query(`DELETE FROM db_backups WHERE filename=?`, [c.id]);
      } else {
        await conn.query(`DELETE FROM ${c.table} WHERE id=?`, [c.id]);
      }
    } catch {}
  }
  // 清理 5) 产生的私信与关注/拉黑
  await conn.query(`DELETE FROM messages WHERE body IN ('hi','hi follower','hi all') AND from_id=?`, [A.id]).catch(() => {});
  await conn.query(`DELETE FROM follows WHERE follower_id=? AND followee_id=?`, [A.id, B.id]).catch(() => {});
  await conn.query(`DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?`, [A.id, B.id]).catch(() => {});
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await conn.end();
process.exit(fail ? 1 : 0);
