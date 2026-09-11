/* 批量导入"真人演唱"音频到诗歌库
 *
 * 用途:平台的诗歌音频此前都是合成伴奏,没有一首人声。拿到有授权的演唱录音
 *      (教会/诗班/自己唱的,或明确进入公有领域的录音)后,用这个脚本一次性灌进去。
 *
 * 用法(在 apps/web 目录或任意位置都行):
 *   node scripts/import-vocal-audio.mjs scripts/vocal-manifest.example.json --dry-run
 *   node scripts/import-vocal-audio.mjs my-manifest.json
 *   node scripts/import-vocal-audio.mjs --list        # 列出库里所有诗歌标题,方便对着填 manifest
 *
 * manifest 格式:
 * {
 *   "songs": [
 *     { "title": "奇异恩典", "file": "D:/audio/amazing-grace.mp3",
 *       "credit": "演唱：光盐诗班 / 已获教会授权发布" },
 *     { "title": "平安夜", "url": "https://example.org/silent-night-vocal.mp3",
 *       "credit": "公有领域录音，来源：archive.org", "audioType": "vocal" }
 *   ]
 * }
 * - file  : 本地音频文件，会被复制到 public/uploads/ 并由站内托管（推荐）
 * - url   : 外链地址，直接写库
 * - audioType 默认 vocal；若导入的是伴奏就写 instrumental
 */
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LIST = args.includes('--list');
const manifestPath = args.find((a) => !a.startsWith('--'));

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

// ---------- --list ----------
if (LIST || !manifestPath) {
  const [rows] = await conn.query(
    `SELECT id, title, author, audio_type, (audio_url <> '') AS has_audio FROM songs ORDER BY title`
  );
  console.log(`共 ${rows.length} 首诗歌:`);
  for (const r of rows) {
    const tag = r.audio_type === 'vocal' ? '🎤 人声' : r.audio_type === 'instrumental' ? '🎹 伴奏' : '　 无音频';
    console.log(`  ${tag}  ${r.title}${r.author ? ` — ${r.author}` : ''}`);
  }
  if (!LIST) {
    console.log('');
    console.log('用法: node scripts/import-vocal-audio.mjs <manifest.json> [--dry-run]');
  }
  await conn.end();
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error(`找不到 manifest 文件: ${manifestPath}`);
  await conn.end();
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Array.isArray(manifest) ? manifest : manifest.songs || [];
if (!entries.length) {
  console.error('manifest 里没有 songs 条目');
  await conn.end();
  process.exit(1);
}

const stamp = new Date();
const ym = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}`;
const uploadDir = path.join(webDir, 'public', 'uploads', ym);

let okCount = 0;
const problems = [];

for (const e of entries) {
  const title = String(e.title || '').trim();
  if (!title) { problems.push('有一条缺 title，已跳过'); continue; }

  const [rows] = await conn.query(
    `SELECT id, title, audio_url, audio_type FROM songs WHERE title = ? LIMIT 2`,
    [title]
  );
  if (rows.length === 0) { problems.push(`「${title}」库里没有这首歌，先投稿或改标题；已跳过`); continue; }
  if (rows.length > 1)  { problems.push(`「${title}」库里有多条同名记录，为避免改错，请手动处理；已跳过`); continue; }

  const song = rows[0];
  const audioType = e.audioType || 'vocal';
  if (!['vocal', 'instrumental', 'none'].includes(audioType)) {
    problems.push(`「${title}」audioType 只能填 vocal / instrumental / none；已跳过`);
    continue;
  }
  const credit = String(e.credit || '').trim();
  if (audioType !== 'none' && !credit) {
    problems.push(`「${title}」缺 credit(演唱者与授权说明)，不允许导入无授权的音频；已跳过`);
    continue;
  }

  // 决定新的 audio_url
  let newUrl = song.audio_url;
  let action = '';
  if (e.url) {
    newUrl = String(e.url).trim();
    action = `外链 -> ${newUrl}`;
  } else if (e.file) {
    const src = path.resolve(e.file);
    if (!existsSync(src)) { problems.push(`「${title}」找不到音频文件 ${src}；已跳过`); continue; }
    const ext = (path.extname(src) || '.mp3').toLowerCase();
    const name = `${song.id}-${Date.now().toString(36)}${ext}`;
    if (DRY) {
      action = `复制 ${src} -> public/uploads/${ym}/${name}`;
    } else {
      mkdirSync(uploadDir, { recursive: true });
      copyFileSync(src, path.join(uploadDir, name));
      newUrl = `/uploads/${ym}/${name}`;
      action = `已复制到 ${newUrl}`;
    }
  } else {
    problems.push(`「${title}」既没有 url 也没有 file；已跳过`);
    continue;
  }

  if (DRY) {
    console.log(`[dry-run] ${title}  ${song.audio_type} -> ${audioType}  | ${action} | ${credit}`);
    okCount++;
    continue;
  }

  await conn.query(`UPDATE songs SET audio_url = ?, audio_type = ?, audio_credit = ? WHERE id = ?`, [
    newUrl, audioType, credit, song.id,
  ]);
  console.log(`✅ ${title}  ${song.audio_type} -> ${audioType}  | ${action} | ${credit}`);
  okCount++;
}

console.log('');
console.log(`完成:成功导入 ${okCount} / ${entries.length} 条`);
if (problems.length) {
  console.log('需要处理:');
  for (const p of problems) console.log(`  ⚠️  ${p}`);
}

const [dist] = await conn.query(
  `SELECT audio_type, COUNT(*) AS c FROM songs GROUP BY audio_type ORDER BY c DESC`
);
console.log('当前库内分布:');
for (const r of dist) console.log(`  ${String(r.audio_type).padEnd(14)} ${r.c} 首`);

await conn.end();
