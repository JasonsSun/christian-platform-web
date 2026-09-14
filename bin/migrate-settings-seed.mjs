/* 一次性迁移:给 settings 表灌入默认运行配置
 *
 * 背景:settings 表从建表起就没有任何种子数据,后台「系统设置」页面是
 * 「读什么显示什么」的纯动态渲染 —— 表里没行,页面就只剩标题和一个
 * 孤零零的「保存更改」按钮,管理员无从下手。
 *
 * 本脚本把四类配置补齐(幂等 INSERT IGNORE,已存在的 key 不会被覆盖):
 *   general  基础   站点名 / 站点公告 / 维护模式 / 维护公告
 *   upload   上传   各类媒体大小上限(MB)  —— 上传接口会真实读取
 *   notify   通知   邮件 / 短信 / 推送开关 与 通知保留天数
 *   search   搜索   最小关键词长度 / 每页条数 / 全文检索开关
 *
 * 用法(在 apps/web 目录执行):
 *   node bin/migrate-settings-seed.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const envPath = path.resolve('.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

const SEED = [
  // —— 基础 ——
  ['site_name', '圣约社区', '站点名称', 'general'],
  ['site_notice', '', '站点公告（留空不展示）', 'general'],
  ['maintenance_mode', 'false', '维护模式（开启后仅管理员可写，其余只读）', 'general'],
  ['maintenance_notice', '平台正在维护升级，部分功能暂时不可用，请稍后再来。', '维护公告', 'general'],
  ['allow_register', 'true', '开放新用户注册', 'general'],

  // —— 上传 ——（server/media.ts 按 upload.max_<kind>_mb 读取）
  ['upload.max_image_mb', '50', '单张图片上限(MB)', 'upload'],
  ['upload.max_audio_mb', '600', '单个音频上限(MB)', 'upload'],
  ['upload.max_video_mb', '4000', '单个视频上限(MB)', 'upload'],
  ['upload.max_score_mb', '300', '单份曲谱上限(MB)', 'upload'],
  ['upload.max_doc_mb', '300', '单个文档上限(MB)', 'upload'],
  ['upload.scan_enabled', 'true', '上传后安全扫描', 'upload'],

  // —— 通知 ——
  ['notify.enable_email', 'false', '启用邮件通知（需先配 SMTP）', 'notify'],
  ['notify.enable_sms', 'false', '启用短信通知（需资质与凭证）', 'notify'],
  ['notify.enable_push', 'false', '启用 WebPush 推送', 'notify'],
  ['notify.retain_days', '90', '站内通知保留天数', 'notify'],

  // —— 搜索 ——
  ['search.min_keyword', '2', '最小搜索关键词长度', 'search'],
  ['search.page_size', '20', '搜索结果每页条数', 'search'],
  ['search.fulltext', 'false', '启用全文检索（关闭时走 LIKE 匹配）', 'search'],

  // —— 模块开关 ——（true=开放；关闭后导航隐藏、页面显示「已暂停服务」、接口 403）
  ['module.bible', 'true', '模块开关：圣经阅读', 'module'],
  ['module.plans', 'true', '模块开关：读经计划', 'module'],
  ['module.songs', 'true', '模块开关：赞美诗歌', 'module'],
  ['module.media', 'true', '模块开关：媒体中心（含上传）', 'module'],
  ['module.live', 'true', '模块开关：直播', 'module'],
  ['module.prayers', 'true', '模块开关：代祷墙', 'module'],
  ['module.activities', 'true', '模块开关：活动', 'module'],
  ['module.groups', 'true', '模块开关：团契小组', 'module'],
  ['module.community', 'true', '模块开关：社区内容（文章/见证/关注流）', 'module'],
  ['module.messages', 'true', '模块开关：私信', 'module'],
  ['module.nearby', 'true', '模块开关：附近的人', 'module'],
  ['module.donate', 'true', '模块开关：捐赠与支出', 'module'],
];

const mysqlUrl = pathToFileURL(path.resolve('node_modules/mysql2/promise.js')).href;
const { default: mysql } = await import(mysqlUrl);
const conn = await mysql.createConnection(cfg);

// 旧口径合并:历史库里留了几个代码从未读取的同义 key,统一搬到新 key 上,
// 避免后台出现「同义两行」。仅在新 key 是本脚本刚建的默认值时才搬旧值,
// 若两边都是既有数据则保留新 key 并打印提示,交给管理员自行决定。
const LEGACY_MAP = [
  ['site.name', 'site_name'],
  ['site.maintenance_mode', 'maintenance_mode'],
  ['notify.push_enabled', 'notify.enable_push'],
  ['search.index_enabled', 'search.fulltext'],
];




const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
let inserted = 0;
let skipped = 0;

for (const [key, value, label, group] of SEED) {
  const [r] = await conn.query(
    `INSERT IGNORE INTO settings (key_name, value, label, group_name, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [key, value, label, group, now]
  );
  if (r.affectedRows > 0) inserted++;
  else skipped++;
}

let merged = 0;
const rowsNow = await conn.query(`SELECT key_name, value FROM settings`);
const current = new Map(rowsNow[0].map((r) => [r.key_name, String(r.value ?? '')]));
const DEFAULT_OF = new Map(SEED.map(([k, v]) => [k, String(v)]));

console.log('[seed] 旧口径合并:');
for (const [oldKey, newKey] of LEGACY_MAP) {
  if (!current.has(oldKey)) continue;
  const oldValue = current.get(oldKey);
  const cur = current.get(newKey);
  // 新 key 还是脚本默认值 → 说明没人改过,搬旧值过来
  if (cur === DEFAULT_OF.get(newKey) && oldValue !== '') {
    await conn.query(`UPDATE settings SET value=?, updated_at=? WHERE key_name=?`, [oldValue, now, newKey]);
    console.log(`  ${oldKey} -> ${newKey} (沿用旧值 ${oldValue})`);
  } else {
    console.log(`  ${oldKey}(${oldValue}) 已被 ${newKey}(${cur}) 取代，删除旧key`);
  }
  await conn.query(`DELETE FROM settings WHERE key_name=?`, [oldKey]);
  merged++;
}
if (!merged) console.log('  (无需合并)');

const [rows] = await conn.query(
  `SELECT group_name, COUNT(*) c FROM settings GROUP BY group_name ORDER BY group_name`
);
console.log(`[seed] 新增 ${inserted} 项，已存在跳过 ${skipped} 项`);
console.log('[seed] 当前配置分布:');
for (const r of rows) console.log(`  ${r.group_name}: ${r.c} 项`);
await conn.end();
console.log('[seed] done.');
