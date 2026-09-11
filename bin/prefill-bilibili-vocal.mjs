/* 给诗歌库批量登记 B站真人演唱外链（listen_url + listen_source='bilibili'）
 *
 * 背景:诗歌模块的音频原本全是合成伴奏,没有一首人声。平台不搬运版权音频,
 *      只把听众"送出去"听外部真人演唱版。这份 manifest 是人工从 B站搜索页
 *      筛出的『有人声演唱』结果(儿童合唱/诗班/独唱等),登记为可一键跳转的外链。
 *
 * 用法(在 apps/web 目录):
 *   node bin/prefill-bilibili-vocal.mjs --dry-run
 *   node bin/prefill-bilibili-vocal.mjs
 *
 * manifest 见同目录 bilibili-vocal-manifest.json,键为歌曲 id,值为 B站 BV 号。
 * 仅更新 manifest 中列出的歌曲;库中不存在的 id 会报错跳过,不影响其它。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const DRY = process.argv.slice(2).includes('--dry-run');

// ---------- 环境 ----------
const envFile = path.join(webDir, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'christian_platform',
};

const mysqlUrl = pathToFileURL(path.join(webDir, 'node_modules/mysql2/promise.js')).href;
const { default: mysql } = await import(mysqlUrl);
const conn = await mysql.createConnection(cfg);

const manifestPath = path.join(scriptDir, 'bilibili-vocal-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest).filter(([k]) => !k.startsWith('_'));

console.log(`读取 ${entries.length} 条外链登记(B站)\n`);

let ok = 0;
const problems = [];
for (const [id, bvid] of entries) {
  const bv = String(bvid).trim();
  if (!/^BV[0-9A-Za-z]+$/.test(bv)) { problems.push(`「${id}」BV 号格式不对:${bv}`); continue; }
  const url = `https://www.bilibili.com/video/${bv}/`;

  const [rows] = await conn.query(
    `SELECT id, title, listen_url, listen_source FROM songs WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) { problems.push(`「${id}」库里没有这首歌,跳过`); continue; }
  const song = rows[0];

  if (DRY) {
    console.log(`[dry-run] ${song.title} (${id})  -> ${url}  [原: ${song.listen_url || '(空)'}]`);
    ok++;
    continue;
  }

  await conn.query(
    `UPDATE songs SET listen_url = ?, listen_source = 'bilibili' WHERE id = ?`,
    [url, id]
  );
  console.log(`✅ ${song.title} (${id})  -> ${url}`);
  ok++;
}

console.log(`\n完成:登记 ${ok} / ${entries.length} 条${problems.length ? `,问题 ${problems.length} 条` : ''}`);
for (const p of problems) console.log(`  ⚠️  ${p}`);

const [dist] = await conn.query(
  `SELECT COUNT(*) AS c FROM songs WHERE listen_url <> '' AND listen_url IS NOT NULL`
);
console.log(`当前库内已登记外链的歌曲:${dist[0].c} 首`);

await conn.end();
