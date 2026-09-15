// SSR 冒烟:确认新接的后台播放组件不会在服务端渲染期抛错。
// 用法: BASE=http://127.0.0.1:PORT node scripts/smoke-backplay.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3200';
const paths = [
  '/me',
  '/bible/cuv/jhn/3',
  '/songs',
  '/community',
  '/media/1',
  '/contents/1',
];
let fail = 0;
for (const p of paths) {
  try {
    const r = await fetch(BASE + p, { redirect: 'manual' });
    const code = r.status;
    const ok = code >= 200 && code < 400;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${code} ${p}`);
    if (!ok) fail++;
  } catch (e) {
    console.log(`FAIL  ERR ${p} ${e.message}`);
    fail++;
  }
}
console.log(fail === 0 ? 'SSR_SMOKE_OK' : `SSR_SMOKE_FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
