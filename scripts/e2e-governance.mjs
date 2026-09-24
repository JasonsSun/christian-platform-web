// 端到端验证「团契归属规则」与「活动取消治理」
// 运行: BASE=http://127.0.0.1:3941 node scripts/e2e-governance.mjs
//
// 覆盖：
//   A. 团契
//      1) 单人团：团长不退出 → 团契依然存在（不会被动解散）
//      2) 单人团：团长以 transfer 退出 → 409（无接任者）
//      3) 单人团：团长以 dissolve 退出 → 解散
//      4) 多人团：团长 transfer 退出 → 移交给最早入群者
//      5) 多人团：团长 dissolve 退出 → 整团解散（成员/动态级联清除）
//      6) 普通成员退出 → 只删自己那一行
//   B. 活动
//      7) 创建活动 → 创建人自动成为第一参与人（registered=true）
//      8) 他人报名 → confirmed 人数 +1
//      9) 创建人取消活动 → 状态 cancelled，且全部参与人收到通知
//     10) 取消后报名 → 409
//     11) 管理员改上下架 → 主办方收到的通知写成中文，不递裸 code
//
// 结束时清理全部测试数据。

import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = process.env.BASE || 'http://127.0.0.1:3941';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);

const b64 = (s) => Buffer.from(s).toString('base64url');
function signJwt(payload, secret) {
  const body = { ...payload, iss: 'christian-platform' };
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${extra}`); }
};

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});

// 取 3 个可用用户：owner 用第一个，另外两个当成员
const [users] = await conn.query(
  "SELECT id, display_name, role FROM users WHERE status='active' ORDER BY created_at LIMIT 3"
);
if (users.length < 3) { console.log('可用用户不足 3 个，跳过'); process.exit(0); }

const tok = (u) => signJwt(
  { sub: u.id, role: u.role, typ: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
  env.JWT_SECRET
);
const H = (u) => ({ Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' });

const api = async (u, method, path, body) => {
  const res = await fetch(BASE + '/api/v1' + path, {
    method, headers: H(u), body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

const created = { groups: [], activities: [] };

/** 用 owner 建一个团，可选把若干成员拉进来 */
async function mkGroup(owner, name, memberUsers = []) {
  const r = await api(owner, 'POST', '/groups', {
    name, description: 'e2e 治理测试团契，结束后自动清理', category: 'fellowship', city: '测试',
  });
  const id = r.json?.id;
  if (!id) throw new Error(`建团失败: ${r.status} ${JSON.stringify(r.json)}`);
  created.groups.push(id);
  await conn.query(`UPDATE group_members SET role='owner' WHERE group_id=? AND user_id=?`, [id, owner.id]);
  for (const m of memberUsers) {
    // 直接写库保证 joined_at 顺序可控；走接口则时间戳会几乎相同
    await conn.query(
      `INSERT IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?, 'member', ?)`,
      [id, m.id, m.joinedAt]
    );
  }
  return id;
}

const groupExists = async (id) => {
  const [[r]] = await conn.query('SELECT COUNT(*) AS c FROM `groups` WHERE id=?', [id]);
  return Number(r.c) > 0;
};
const groupOwner = async (id) => {
  const [[r]] = await conn.query('SELECT owner_id FROM `groups` WHERE id=?', [id]);
  return r?.owner_id ?? null;
};

console.log(`\n测试用户: ${users.map((u) => `${u.display_name}(${u.role})`).join(', ')}\n`);
const [uA, uB, uC] = users;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');

/* ================= A. 团契 ================= */
console.log('A. 团契归属规则');

// 1) 单人团：团长不退出 → 团契存在
{
  const gid = await mkGroup(uA, 'E2E-单人团-不退出');
  check('单人团：创建后团契存在', await groupExists(gid));
  check('单人团：团长未被自动更换', (await groupOwner(gid)) === uA.id);
  check('单人团：读详情 memberCount=1', (await api(uA, 'GET', `/groups/${gid}`)).json?.memberCount === 1);
}

// 2) 单人团：transfer 退出 → 409
{
  const gid = await mkGroup(uA, 'E2E-单人团-transfer');
  const r = await api(uA, 'DELETE', `/groups/${gid}/join`, { mode: 'transfer' });
  check('单人团：transfer 退出被拒（409）', r.status === 409, `得到 ${r.status}`);
  check('单人团：拒绝后团契仍在', await groupExists(gid));
}

// 3) 单人团：dissolve 退出 → 解散
{
  const gid = await mkGroup(uA, 'E2E-单人团-dissolve');
  const r = await api(uA, 'DELETE', `/groups/${gid}/join`, { mode: 'dissolve' });
  check('单人团：dissolve 退出成功', r.status === 200, `得到 ${r.status}`);
  check('单人团：返回 dissolved=true', r.json?.dissolved === true);
  check('单人团：团契已从库中删除', !(await groupExists(gid)));
}

// 4) 多人团：transfer → 移交给最早入群者 uB
{
  const gid = await mkGroup(uA, 'E2E-多人团-transfer', [
    { id: uC.id, joinedAt: iso(-1) },   // 更早入群
    { id: uB.id, joinedAt: iso(0) },
  ]);
  const r = await api(uA, 'DELETE', `/groups/${gid}/join`, { mode: 'transfer' });
  check('多人团：transfer 退出成功', r.status === 200, `得到 ${r.status}`);
  check('多人团：返回 transferred=true', r.json?.transferred === true);
  check('多人团：移交给最早入群者 uC', r.json?.newOwnerId === uC.id, `得到 ${r.json?.newOwnerId}`);
  check('多人团：库里 owner_id 已更新为 uC', (await groupOwner(gid)) === uC.id);
  check('多人团：团契未被解散', await groupExists(gid));
  check('多人团：团长自己的成员行已删除',
    Number((await conn.query('SELECT COUNT(*) AS c FROM group_members WHERE group_id=? AND user_id=?', [gid, uA.id]))[0][0].c) === 0);
  const own = (await conn.query(
    "SELECT title FROM notifications WHERE user_id=? AND type='group_owner' AND link=?", [uC.id, `/groups/${gid}`]
  ))[0];
  check('多人团：新团长收到移交通知', own.length > 0);
  // 通知行左侧本来就按 NOTIF_TYPE_ICON 画了一枚皇冠 SVG，标题再带一个 👑 就是同一行两个图标
  check('多人团：移交通知标题不带 emoji', !/^\p{Extended_Pictographic}/u.test(own[0]?.title || ''), `得到「${own[0]?.title}」`);
}

// 5) 多人团：dissolve → 整团删除，成员/动态级联清除
{
  const gid = await mkGroup(uA, 'E2E-多人团-dissolve', [{ id: uB.id, joinedAt: iso(-1) }]);
  await conn.query(`INSERT INTO group_posts (id, group_id, user_id, body, created_at) VALUES (?,?,?,?,?)`,
    [`e2e_post_${Date.now()}`, gid, uA.id, 'e2e 动态', iso(0)]);
  const r = await api(uA, 'DELETE', `/groups/${gid}/join`, { mode: 'dissolve' });
  check('多人团：dissolve 退出成功', r.status === 200, `得到 ${r.status}`);
  check('多人团：团契已删除', !(await groupExists(gid)));
  check('多人团：成员行级联清除',
    Number((await conn.query('SELECT COUNT(*) AS c FROM group_members WHERE group_id=?', [gid]))[0][0].c) === 0);
  check('多人团：动态级联清除',
    Number((await conn.query('SELECT COUNT(*) AS c FROM group_posts WHERE group_id=?', [gid]))[0][0].c) === 0);
  check('多人团：成员收到解散通知',
    Number((await conn.query(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND type='group_dissolved'", [uB.id]
    ))[0][0].c) > 0);
}

// 6) 普通成员退出 → 只删自己
{
  const gid = await mkGroup(uA, 'E2E-成员退出', [{ id: uB.id, joinedAt: iso(-1) }]);
  const r = await api(uB, 'DELETE', `/groups/${gid}/join`);
  check('普通成员：退出成功', r.status === 200, `得到 ${r.status}`);
  check('普通成员：未被解散', await groupExists(gid));
  check('普通成员：团长未变', (await groupOwner(gid)) === uA.id);
  check('普通成员：只剩团长一行',
    Number((await conn.query('SELECT COUNT(*) AS c FROM group_members WHERE group_id=?', [gid]))[0][0].c) === 1);
}

/* ================= B. 活动 ================= */
console.log('\nB. 活动取消治理');
{
  const startAt = new Date(Date.now() + 5 * 86400000).toISOString();
  const r = await api(uA, 'POST', '/activities', {
    title: 'E2E 治理测试活动', description: '用于验证创建人默认参与与取消通知，结束后清理。',
    category: 'fellowship', location: '测试地点', city: '测试', startAt, capacity: 10,
  });
  check('创建活动成功', r.status === 201, `得到 ${r.status} ${JSON.stringify(r.json)}`);
  const aid = r.json?.id;
  created.activities.push(aid);
  check('创建人默认已报名（registered=true）', r.json?.registered === true);
  check('创建人计入 confirmed 人数', r.json?.confirmedCount === 1, `得到 ${r.json?.confirmedCount}`);

  const reg = await api(uB, 'POST', `/activities/${aid}/register`);
  check('他人报名成功', reg.status === 200, `得到 ${reg.status}`);
  const detail = await api(uA, 'GET', `/activities/${aid}`);
  check('确认人数变为 2', detail.json?.confirmedCount === 2, `得到 ${detail.json?.confirmedCount}`);
  check('参与人列表含创建人',
    (detail.json?.participants || []).some((p) => p.id === uA.id));

  const cancel = await api(uA, 'POST', `/activities/${aid}/cancel`, { reason: 'e2e 测试取消' });
  check('创建人可取消活动', cancel.status === 200, `得到 ${cancel.status}`);
  check('取消通知覆盖 2 名参与人', cancel.json?.notified === 2, `得到 ${cancel.json?.notified}`);
  check('参与人收到取消通知',
    Number((await conn.query(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND type='activity_cancelled'", [uB.id]
    ))[0][0].c) > 0);
  const after = await api(uA, 'GET', `/activities/${aid}`);
  check('活动状态已为 cancelled', after.json?.status === 'cancelled', `得到 ${after.json?.status}`);

  const regAfter = await api(uC, 'POST', `/activities/${aid}/register`);
  check('已取消活动不可再报名（409）', regAfter.status === 409, `得到 ${regAfter.status}`);

  const cancelAgain = await api(uA, 'POST', `/activities/${aid}/cancel`, {});
  check('重复取消幂等（alreadyCancelled）', cancelAgain.json?.alreadyCancelled === true);
  check('幂等时不重复通知', cancelAgain.json?.notified === 0, `得到 ${cancelAgain.json?.notified}`);
}

// 非创建人、非管理员不可取消
{
  const startAt = new Date(Date.now() + 5 * 86400000).toISOString();
  const r = await api(uA, 'POST', '/activities', {
    title: 'E2E 权限测试活动', description: '用于验证只有创建人和管理员能取消。',
    category: 'fellowship', location: '测试地点', city: '测试', startAt, capacity: 10,
  });
  const aid = r.json?.id;
  created.activities.push(aid);
  const asOther = await api(uB, 'POST', `/activities/${aid}/cancel`, {});
  check('非创建人取消被拒（403）', asOther.status === 403, `得到 ${asOther.status}`);
}

// 管理员改上下架：收件人是主办方（普通用户），通知措辞不能把 code 直接递给他
{
  const [admins] = await conn.query(
    "SELECT id, role FROM users WHERE role='admin' AND status='active' LIMIT 1"
  );
  const startAt = new Date(Date.now() + 6 * 86400000).toISOString();
  const r = await api(uA, 'POST', '/activities', {
    title: 'E2E 上下架通知活动', description: '用于验证状态更新通知的中文口径，结束后清理。',
    category: 'fellowship', location: '测试地点', city: '测试', startAt, capacity: 10,
  });
  const aid = r.json?.id;
  created.activities.push(aid);
  if (!admins.length) {
    console.log('  · 库里无可用管理员，跳过状态更新通知检查');
  } else {
    const patch = await api(admins[0], 'PATCH', '/admin/activities', { activityId: aid, status: 'offline' });
    check('管理员可下架活动', patch.status === 200, `得到 ${patch.status} ${JSON.stringify(patch.json)}`);
    const [rows] = await conn.query(
      "SELECT body FROM notifications WHERE user_id=? AND type='activity' AND body LIKE ?"
      + ' ORDER BY created_at DESC LIMIT 1',
      [uA.id, '%E2E 上下架通知活动%']
    );
    const body = rows[0]?.body || '';
    check('状态更新通知写成中文（含「已下架」）', body.includes('已下架'), `得到「${body}」`);
    // 反向对照：一句「状态已更新为 offline」在这道门上必须挂
    check('通知正文不含裸英文状态码',
      !/\b(published|offline|cancelled|pending)\b/.test(body), `得到「${body}」`);
  }
}

/* ================= 清理 ================= */
console.log('\n清理测试数据…');
for (const gid of created.groups) {
  await conn.query('DELETE FROM group_posts WHERE group_id=?', [gid]);
  await conn.query('DELETE FROM group_members WHERE group_id=?', [gid]);
  await conn.query('DELETE FROM `groups` WHERE id=?', [gid]);
}
for (const aid of created.activities) {
  await conn.query('DELETE FROM activity_registrations WHERE activity_id=?', [aid]);
  await conn.query('DELETE FROM activity_checkins WHERE activity_id=?', [aid]);
  await conn.query('DELETE FROM activities WHERE id=?', [aid]);
}
await conn.query(
  "DELETE FROM notifications WHERE type IN ('group_owner','group_dissolved','activity_cancelled') AND created_at >= NOW() - INTERVAL 30 MINUTE"
);
await conn.query(
  "DELETE FROM notifications WHERE type='activity' AND body LIKE '「E2E 上下架通知活动%' AND created_at >= NOW() - INTERVAL 30 MINUTE"
);
await conn.end();

console.log(`\n结果: ${pass} 通过, ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
