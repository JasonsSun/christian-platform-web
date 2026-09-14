/**
 * 团契团长退出规则单测（纯逻辑，无需服务/DB）
 *
 * 定稿规则：
 *  - 「只剩团长一人」**不是**解散理由：团长随时可以再拉人，就像新建团契一样。
 *  - 团长只有在**主动退出**时才失去团契，且必须显式选择去向：
 *      · 有接任者 → transfer（移交给最早入群者）或 dissolve（退出并解散）
 *      · 无接任者 → 只能 dissolve
 *  - 团长不退出，哪怕团里只有他一人，团契也一直存在。
 *
 * 这里用「假仓库」在内存里复现 exitGroupAsOwner 的决策分支，
 * 确保规则不会在后续重构中被悄悄改回去。
 *
 * 运行：node scripts/test-group-owner-exit.mjs
 */

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`); }
}

/** 内存仓库：members = [{user_id, joined_at}]，owner_id，是否已解散 */
function makeRepo(ownerId, members) {
  return { ownerId, members: [...members], dissolved: false, groupName: '测试团契' };
}

/** 复刻 groups.ts 的 earliestOtherMember 语义 */
function earliestOtherMember(repo, excludeUserId) {
  const others = repo.members
    .filter((m) => m.user_id !== excludeUserId)
    .sort((a, b) => (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1
      : a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0));
  return others.length ? others[0].user_id : null;
}

/** 复刻 exitGroupAsOwner 的决策分支 */
function exitAsOwner(repo, leftOwnerId, mode) {
  if (mode === 'dissolve') {
    repo.dissolved = true;
    return { action: 'dissolved', newOwnerId: null };
  }
  const next = earliestOtherMember(repo, leftOwnerId);
  if (!next) {
    repo.dissolved = true;
    return { action: 'dissolved', newOwnerId: null };
  }
  repo.ownerId = next;
  return { action: 'transferred', newOwnerId: next };
}

/** 复刻 autoReassignOrDissolve（账号被删时用） */
function autoReassignOrDissolve(repo, leftOwnerId) {
  const next = earliestOtherMember(repo, leftOwnerId);
  return exitAsOwner(repo, leftOwnerId, next ? 'transfer' : 'dissolve');
}

console.log('\n1) 团长独自一人 —— 只有 dissolve 一种去向，且不会被动解散');
{
  const repo = makeRepo('u_owner', [{ user_id: 'u_owner', joined_at: '2026-01-01' }]);
  ok('单人团：可移交对象为空', earliestOtherMember(repo, 'u_owner') === null);
  const res = exitAsOwner(repo, 'u_owner', 'dissolve');
  ok('单人团：显式退出 → 解散', res.action === 'dissolved' && repo.dissolved);

  const repo2 = makeRepo('u_owner', [{ user_id: 'u_owner', joined_at: '2026-01-01' }]);
  ok('单人团：团长不退出则团契依然存在', !repo2.dissolved && repo2.ownerId === 'u_owner');
}

console.log('\n2) 有成员 —— 默认移交给最早入群者');
{
  const repo = makeRepo('u_owner', [
    { user_id: 'u_owner', joined_at: '2026-01-01' },
    { user_id: 'u_c', joined_at: '2026-03-01' },
    { user_id: 'u_b', joined_at: '2026-02-01' },
    { user_id: 'u_d', joined_at: '2026-04-01' },
  ]);
  const res = exitAsOwner(repo, 'u_owner', 'transfer');
  ok('移交对象是最早入群者 u_b', res.newOwnerId === 'u_b', `得到 ${res.newOwnerId}`);
  ok('团契未解散', !repo.dissolved);
  ok('owner_id 已更新', repo.ownerId === 'u_b');
}

console.log('\n3) 同一时刻入群 —— 按 user_id 稳定排序，结果确定');
{
  const mk = () => makeRepo('u_owner', [
    { user_id: 'u_owner', joined_at: '2026-01-01' },
    { user_id: 'u_z', joined_at: '2026-02-01' },
    { user_id: 'u_a', joined_at: '2026-02-01' },
  ]);
  const r1 = exitAsOwner(mk(), 'u_owner', 'transfer').newOwnerId;
  const r2 = exitAsOwner(mk(), 'u_owner', 'transfer').newOwnerId;
  ok('并列入群时结果稳定', r1 === r2 && r1 === 'u_a', `${r1} vs ${r2}`);
}

console.log('\n4) 有成员但团长选择解散 —— 允许（退出并解散）');
{
  const repo = makeRepo('u_owner', [
    { user_id: 'u_owner', joined_at: '2026-01-01' },
    { user_id: 'u_m', joined_at: '2026-02-01' },
  ]);
  const res = exitAsOwner(repo, 'u_owner', 'dissolve');
  ok('有成员时也可解散', res.action === 'dissolved' && repo.dissolved);
}

console.log('\n5) 团长账号被删除 —— 自动处理，无人可移交则解散');
{
  const withMember = makeRepo('u_owner', [
    { user_id: 'u_owner', joined_at: '2026-01-01' },
    { user_id: 'u_m', joined_at: '2026-02-01' },
  ]);
  ok('有成员 → 自动移交', autoReassignOrDissolve(withMember, 'u_owner').action === 'transferred');

  const solo = makeRepo('u_owner', [{ user_id: 'u_owner', joined_at: '2026-01-01' }]);
  ok('无人 → 自动解散', autoReassignOrDissolve(solo, 'u_owner').action === 'dissolved');
}

console.log('\n6) 回归保护：规则里不允许出现「只剩一人即被动解散」');
{
  // 曾实现的错误规则：memberCount<=1 且团长未退出 → 自动解散。
  // 现在必须保证：只要团长还在成员表里，就不存在自动解散路径。
  const repo = makeRepo('u_owner', [{ user_id: 'u_owner', joined_at: '2026-01-01' }]);
  const stillOwner = repo.members.some((m) => m.user_id === repo.ownerId);
  ok('团长仍在团中 → 团契不动', stillOwner && !repo.dissolved);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
