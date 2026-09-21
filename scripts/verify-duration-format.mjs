// 纯逻辑单测：时长格式化（src/lib/format.ts 的 formatDuration / formatTimestamp）。
// 这两个函数是全站唯一的时长出口（播放器时钟 formatTime 只是在 formatTimestamp 上补了 0:00），
// 收敛前有 7 份各写各的版本，出现过「27 秒的音频显示成 0 分钟」「两小时的回放显示成 120:00」。
// 不依赖数据库，也不用 --experimental-strip-types（本仓库锁的 node 22.3 还没有那个 flag），
// 直接用 devDependencies 里的 typescript 把 .ts 转译到临时目录再 import。
// 运行: npm run test:format
import { readFileSync } from 'fs';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/format.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
});
const dir = await mkdtemp(join(tmpdir(), 'sjjob-format-'));
const file = join(dir, 'format.mjs');
await writeFile(file, outputText);
const { formatDuration, formatTimestamp } = await import(pathToFileURL(file).href);

let pass = 0;
let fail = 0;
function check(name, cond, got) {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}  (实际: ${JSON.stringify(got)})`); }
}

console.log('1) 口语化时长 formatDuration：不足一分钟要说秒，不能说「0 分钟」');
for (const [sec, want] of [
  [0, '0 秒'], [1, '1 秒'], [27, '27 秒'], [59, '59 秒'],
  [60, '1 分钟'], [90, '1 分 30 秒'], [252, '4 分 12 秒'], [1800, '30 分钟'],
  [3599, '59 分 59 秒'], [3600, '1 小时'], [3630, '1 小时 1 分'], [9000, '2 小时 30 分'],
]) {
  check(`${sec}s -> ${want}`, formatDuration(sec) === want, formatDuration(sec));
}

console.log('2) formatDuration 的脏输入不能漏出 NaN / undefined');
for (const bad of [undefined, null, NaN, -5, '120']) {
  const out = formatDuration(bad);
  check(`${String(bad)} -> ${out}`, typeof out === 'string' && !/NaN|undefined|Infinity/.test(out), out);
}
check('null -> 0 秒', formatDuration(null) === '0 秒', formatDuration(null));
check("'120' -> 2 分钟", formatDuration('120') === '2 分钟', formatDuration('120'));

console.log('3) 时钟 formatTimestamp：m:ss，过一小时进位；0 返回空串让调用方整段不渲染');
for (const [sec, want] of [
  [0, ''], [27, '0:27'], [65, '1:05'], [252, '4:12'], [599, '9:59'],
  [600, '10:00'], [3599, '59:59'], [3600, '1:00:00'], [4529, '1:15:29'], [7290, '2:01:30'],
]) {
  check(`${sec}s -> ${want}`, formatTimestamp(sec) === want, formatTimestamp(sec));
}
check('undefined -> 空串', formatTimestamp(undefined) === '', formatTimestamp(undefined));
check('负数 -> 空串', formatTimestamp(-30) === '', formatTimestamp(-30));

console.log('4) 两小时的直播回放不能显示成 120:00');
const twoHours = formatTimestamp(7200);
check('7200s 是 h:mm:ss 三段', /^\d+:\d{2}:\d{2}$/.test(twoHours), twoHours);
check('7200s 不是一百多分钟', !/^1\d\d:/.test(twoHours), twoHours);

console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
