// 媒体安全扫描单元冒烟测试(零额外依赖,使用已安装的 typescript 即时转译 scan.ts)
//
// 运行: npm test  (或 node scripts/test-safety.mjs)
// 验证 scanMediaFile 能拦截伪装/恶意文件,放行合法媒体。
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const outDir = path.join(root, '.scanbuild');

function ts(srcRel) {
  const r = spawnSync(
    process.execPath,
    [tsc, path.join(root, srcRel), '--outDir', outDir, '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'node', '--skipLibCheck'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error('tsc 失败:\n', r.stderr || r.stdout);
    process.exit(2);
  }
}

async function main() {
  ts('src/server/scan.ts');
  const { scanMediaFile } = await import(pathToFileURL(path.join(outDir, 'scan.js')).href);

  const dir = path.join(outDir, 'samples');
  await fs.mkdir(dir, { recursive: true });
  const write = async (name, bytes) => {
    const p = path.join(dir, name);
    await fs.writeFile(p, Buffer.from(bytes));
    return p;
  };

  const cases = [
    { name: 'evil.jpg', bytes: [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00], ext: 'jpg', clean: false, must: '可执行' },
    { name: 'ok.jpg', bytes: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46], ext: 'jpg', clean: true },
    { name: 'fake.png', bytes: [0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00], ext: 'png', clean: false, must: '不匹配' },
    { name: 'ok.mp4', bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], ext: 'mp4', clean: true },
    { name: 'ok.mp3', bytes: [0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00], ext: 'mp3', clean: true },
    { name: 'ok.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], ext: 'pdf', clean: true },
  ];

  let pass = 0, fail = 0;
  for (const c of cases) {
    const p = await write(c.name, c.bytes);
    const r = await scanMediaFile(p, c.ext);
    let ok = r.clean === c.clean;
    if (!c.clean && c.must && !r.reasons.some((x) => x.includes(c.must))) ok = false;
    console.log(`${ok ? '✅' : '❌'} ${c.name.padEnd(10)} clean=${r.clean} engine=${r.engine}${r.reasons.length ? ` reasons=[${r.reasons.join(' | ')}]` : ''}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n媒体安全扫描测试: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
