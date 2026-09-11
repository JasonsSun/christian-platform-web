/**
 * 直播录像编排
 * --------------------------------------------------------------
 * 设计:
 *  - 平台不依赖外部 ffmpeg(环境无 ffmpeg),改用 MediaMTX 自带的 record
 *    功能把 RTMP/HLS 流转封装为 mp4 落盘到 recordPath(见 mediamtx.yml)。
 *  - 直播结束(endRoom)时,若 record_enabled=1,扫描该 streamKey 对应的
 *    录制文件,把它移入公共媒体库 public/uploads/YYYYMM/,并写入
 *    media_files(source='live', review_status='pending'),由审核台决定
 *    是否公开发布;超过 24h 仍未通过审核则被清理脚本自动删除。
 *  - 兜底:若 MediaMTX 录像文件未生成(未开 record / 录制失败 / 直播时长
 *    极短),不抛错、只记日志;主播仍可在管理台手动上传录像回放。
 */
import fs from 'node:fs';
import path from 'node:path';
import { exec, q, one, newId, ts } from './db';
import { absFromStorageKey, kindLabel } from './media';
import type { LiveRoomRow } from './live';

/** MediaMTX 录像落盘目录(与 mediamtx.yml 中的 recordPath 一致) */
const RECORD_DIR = (() => {
  const env = process.env.RECORD_DIR;
  if (env) return path.isAbsolute(env) ? env : path.join(process.cwd(), env);
  // 默认:Mediamtx 工作目录下的 recordings
  return path.join(process.cwd(), 'bin', 'mediamtx', 'recordings');
})();

/** MediaMTX 录像文件命名格式:
 *   <pathName>-<YYYY-MM-DD_HH-MM-SS>.<ext>
 * 详见 MediaMTX 官方文档 record pathTemplate。 */
const RECORD_NAME_RE = /^([^-]+(?:-[^-]+)*)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.(mp4|m4s|mp3|ts|mkv)$/i;

function findRecordingFile(streamKey: string): string | null {
  let dir = RECORD_DIR;
  if (!fs.existsSync(dir)) {
    // 兜底:相对 mediamtx.yml 所在目录
    const alt = path.join(process.cwd(), 'bin', 'mediamtx', 'recordings');
    if (fs.existsSync(alt)) dir = alt;
    else return null;
  }
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const matches: { file: string; mtimeMs: number }[] = [];
  for (const n of names) {
    const m = n.match(RECORD_NAME_RE);
    if (!m) continue;
    if (m[1] !== streamKey) continue;
    if (!/\.(mp4|m4s|mkv)$/i.test(m[3])) continue; // 视频
    const full = path.join(dir, n);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.size > 0) {
        matches.push({ file: full, mtimeMs: st.mtimeMs });
      }
    } catch { /* ignore */ }
  }
  if (!matches.length) return null;
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0].file;
}

/** 移动录制文件到公共媒体库 uploads/YYYYMM/<id>.mp4,返回 storage_key */
function moveIntoUploads(src: string, ext = 'mp4'): string {
  const now = new Date();
  const sub = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(process.cwd(), 'public', sub);
  fs.mkdirSync(dir, { recursive: true });
  const id = newId('mrec');
  const filename = `${id}.${ext}`;
  const dst = path.join(dir, filename);
  try {
    fs.renameSync(src, dst);
  } catch (e) {
    // rename 跨盘会失败,降级为 copy + unlink
    fs.copyFileSync(src, dst);
    try { fs.unlinkSync(src); } catch { /* ignore */ }
  }
  return `${sub}/${filename}`;
}

/** 落盘直播录像到 media_files(供审核),返回 media_files.id;失败返回 null */
export async function finalizeLiveRecording(room: LiveRoomRow): Promise<string | null> {
  // 仅当主播申请了录像
  if (!room.record_enabled) return null;
  // 已有录像不重复生成
  if (room.recording_media_id) return room.recording_media_id;

  // 等待 MediaMTX 落盘(流断开后通常 1~3 秒完成)
  let recorded: string | null = null;
  for (let i = 0; i < 6; i++) {
    recorded = findRecordingFile(room.stream_key);
    if (recorded) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!recorded) {
    console.warn(`[live-record] no recording for ${room.stream_key} (record_enabled=1)`);
    return null;
  }

  const stat = fs.statSync(recorded);
  const storageKey = moveIntoUploads(recorded, 'mp4');
  const id = newId('mf');
  const title = `${room.title} - 直播回放`;
  const fileName = path.basename(storageKey);
  await exec(
    `INSERT INTO media_files
      (id, owner_id, file_name, title, mime_type, extension, kind, size_bytes, checksum,
       storage_key, status, review_status, ref_count, source, source_ref, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'ready', 'pending', 0, 'live', ?, ?, ?)`,
    [
      id, room.owner_id, fileName, title,
      'video/mp4', 'mp4', 'video', stat.size, '',
      storageKey, room.id, ts(), ts(),
    ]
  );
  await exec(
    `UPDATE live_rooms SET recording_media_id = ?, updated_at = ? WHERE id = ?`,
    [id, ts(), room.id]
  );
  console.log(`[live-record] saved room=${room.id} media=${id} src=${recorded}`);
  return id;
}

/** 给定媒体 id,返回公开 URL + 直播元信息(供详情页展示) */
export async function liveRecordingMeta(mediaId: string) {
  const m = await one<any>(
    `SELECT m.id, m.title, m.source, m.source_ref, r.title AS room_title, r.ended_at, r.viewer_peak
     FROM media_files m LEFT JOIN live_rooms r ON r.id = m.source_ref
     WHERE m.id = ? AND m.source = 'live'`,
    [mediaId]
  );
  if (!m) return null;
  return {
    source: 'live' as const,
    roomId: m.source_ref,
    roomTitle: m.room_title,
    endedAt: m.ended_at,
    viewerPeak: Number(m.viewer_peak || 0),
  };
}

/** 清理超期未审的直播录像(默认 24h) */
export async function cleanupExpiredLiveRecordings(maxAgeHours = 24): Promise<{ deleted: number; ids: string[] }> {
  const list = await q<any>(
    `SELECT id, storage_key FROM media_files
      WHERE source = 'live' AND review_status = 'pending' AND status <> 'trashed'
        AND created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)`,
    [maxAgeHours]
  );
  const ids: string[] = [];
  for (const r of list) {
    // 软删
    await exec(
      `UPDATE media_files SET status='trashed', updated_at=? WHERE id=?`,
      [ts(), r.id]
    );
    // 删物理文件
    if (r.storage_key) {
      const abs = absFromStorageKey(r.storage_key);
      try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
    }
    // 解除直播房间关联(便于重新录制时不再被旧记录阻断)
    await exec(
      `UPDATE live_rooms SET recording_media_id = NULL, updated_at = ? WHERE recording_media_id = ?`,
      [ts(), r.id]
    );
    ids.push(r.id);
  }
  if (ids.length) console.log(`[live-record] cleanup deleted=${ids.length}`);
  return { deleted: ids.length, ids };
}

// kindLabel 在 media.ts 已导出,这里转一道便于外部直接 import
export { kindLabel };
