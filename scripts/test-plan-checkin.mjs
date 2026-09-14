// 纯逻辑单测：验证"真实读经 → 计划打卡"的判定(decidePlanCheckin)。
// 不依赖数据库，仅测试 src/lib/readingPlans.ts 的纯函数。
// 运行: npm run test:plan   (等价 node --experimental-strip-types scripts/test-plan-checkin.mjs)
import { READING_PLANS, decidePlanCheckin, matchPlanDays } from '../src/lib/readingPlans.ts';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}`); }
}

const get = (id) => READING_PLANS.find((p) => p.id === id);

console.log('1) 单章日计划(约翰福音21天): 读完对应章即打当天勾');
{
  const plan = get('john-21');
  check('john 第5章 → day5', decidePlanCheckin(plan, 'john', 5, new Set(['john:5']), new Set()) === 5);
  check('john 第1章 → day1', decidePlanCheckin(plan, 'john', 1, new Set(['john:1']), new Set()) === 1);
  check('诗篇1 不属于 john-21 → null', decidePlanCheckin(plan, 'psalms', 1, new Set(['psalms:1']), new Set()) === null);
}

console.log('2) 多章日计划(诗篇30天): 一天5篇, 须全部读完才打勾');
{
  const plan = get('psalms-30');
  check('psalms 第3篇 单独 → null', decidePlanCheckin(plan, 'psalms', 3, new Set(['psalms:3']), new Set()) === null);
  check('psalms 第1篇 单独 → null', decidePlanCheckin(plan, 'psalms', 1, new Set(['psalms:1']), new Set()) === null);
  const all = new Set(['psalms:1', 'psalms:2', 'psalms:3', 'psalms:4', 'psalms:5']);
  check('psalms 1-5 全读 → day1', decidePlanCheckin(plan, 'psalms', 5, all, new Set()) === 1);
  const all2 = new Set(['psalms:6', 'psalms:7', 'psalms:8', 'psalms:9', 'psalms:10']);
  check('psalms 6-10 全读 → day2', decidePlanCheckin(plan, 'psalms', 10, all2, new Set()) === 2);
  // 读到 day1 中不属于本批的章（如 psalms:4），但仅 psalms:4 已读 → null
  check('psalms 第4篇 单独 → null', decidePlanCheckin(plan, 'psalms', 4, new Set(['psalms:4']), new Set()) === null);
}

console.log('3) 同章多天计划(诗篇23篇默想7天): 7天都读诗篇23, 每次推进下一天');
{
  const plan = get('psalm23-7');
  check('命中天数应为 7', matchPlanDays(plan, 'psalms', 23).length === 7);
  check('首次读诗篇23 → day1', decidePlanCheckin(plan, 'psalms', 23, new Set(['psalms:23']), new Set()) === 1);
  check('已读1-3 → day4', decidePlanCheckin(plan, 'psalms', 23, new Set(['psalms:23']), new Set([1, 2, 3])) === 4);
  check('全打勾 → null', decidePlanCheckin(plan, 'psalms', 23, new Set(['psalms:23']), new Set([1, 2, 3, 4, 5, 6, 7])) === null);
}

console.log('4) 幂等: 已打勾的天由调用方用 doneDays 去重');
{
  const plan = get('john-21');
  check('john 第5章 已读仍返回5(调用方去重)', decidePlanCheckin(plan, 'john', 5, new Set(['john:5']), new Set([5])) === 5);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
