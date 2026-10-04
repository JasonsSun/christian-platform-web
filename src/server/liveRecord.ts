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
import { kindLabel } from './media';
import { deleteStorageObject } from './storage';
import { recordBaseDir } from './mediamtx';
import type { LiveRoomRow } from './live';

/** MediaMTX 录像落盘目录。必须与 mediamtx.registerPath 写入的 recordPath 前缀一致。 */
const RECORD_DIR = (() => {
  const dir = recordBaseDir();
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
})();

/** 递归收集目录下的媒体文件（recordPath 含 %path，会多一层子目录） */
function walkMedia(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMedia(full, out);
    else if (/\.(mp4|m4s|mkv|ts)$/i.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * 找到该 streamKey 对应的录像文件。
 *
 * MediaMTX 的 recordPath 模板是 `<base>/live/<streamKey>/%Y-%m-%d_%H-%M-%S-%f`，
 * 文件名是**纯时间戳**、不含 streamKey。
 *
 * 取「最早」的一段而不是最新的一段：直播超过 recordSegmentDuration 会被切成多段，
 * 取最新的等于只留最后一小时，用户看到的回放缺一大截。取最早的一段至少是完整开播头。
 */
function findRecordingFile(streamKey: string): string | null {
  const dir = RECORD_DIR;
  if (!fs.existsSync(dir)) return null;
  const relDir = path.join(dir, 'live', streamKey);
  const all = walkMedia(dir);

  // 1) 优先：该 streamKey 专属子目录（含更深层级）下的文件
  let matched = all.filter((f) => {
    const d = path.dirname(f);
    return d === relDir || d.startsWith(relDir + path.sep);
  });
  // 2) 兜底：老命名 `<streamKey>-<时间戳>.<ext>` 直接躺在根目录
  if (!matched.length) {
    matched = all.filter((f) => {
      const b = path.basename(f);
      return b.startsWith(`${streamKey}-`) || b.startsWith(`${streamKey}_`);
    });
  }
  if (!matched.length) return null;

  const mtime = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  matched.sort((a, b) => mtime(b) - mtime(a));
  if (matched.length > 1) {
    console.warn(`[live-record] ${streamKey} 有 ${matched.length} 段录像,采用最早的一段(${matched[matched.length - 1]})`);
  }
  return matched[matched.length - 1];
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

/** 落盘直播录像到 media_files(供审核),返回 media_files.id;失败返回 null。
 *  失败原因写入 live_rooms.recording_error,前端据此显示真实原因而不是一直「生成中」。 */
export async function finalizeLiveRecording(room: LiveRoomRow): Promise<string | null> {
  // 仅当主播申请了录像
  if (!room.record_enabled) return null;
  // 已有录像不重复生成
  if (room.recording_media_id) return room.recording_media_id;

  // 等待 MediaMTX 落盘 / 收尾。流断开后通常 1~3 秒完成,弱网或大文件收尾更慢,给足 30 秒。
  let recorded: string | null = null;
  for (let i = 0; i < 30; i++) {
    recorded = findRecordingFile(room.stream_key);
    if (recorded) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!recorded) {
    const msg = fs.existsSync(RECORD_DIR)
      ? '直播结束时未找到录像文件（MediaMTX 未开启录制或直播时长过短）'
      : `录像目录不存在：${RECORD_DIR}（RECORD_DIR 未配置或与 MediaMTX 未挂载同一目录）`;
    console.warn(`[live-record] no recording for ${room.stream_key}: ${msg}`);
    await exec(`UPDATE live_rooms SET recording_error = ?, updated_at = ? WHERE id = ?`, [msg.slice(0, 250), ts(), room.id])
      .catch(() => {});
    return null;
  }

  try {
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
      `UPDATE live_rooms SET recording_media_id = ?, recording_error = '', updated_at = ? WHERE id = ?`,
      [id, ts(), room.id]
    );
    console.log(`[live-record] saved room=${room.id} media=${id} src=${recorded}`);
    return id;
  } catch (e: any) {
    const msg = `录像入库失败：${String(e?.message || e).slice(0, 200)}`;
    console.error(`[live-record] finalize failed room=${room.id}`, e);
    await exec(`UPDATE live_rooms SET recording_error = ?, updated_at = ? WHERE id = ?`, [msg, ts(), room.id])
      .catch(() => {});
    return null;
  }
}

/** 某直播间的录像审核状态(pending/approved/rejected/null=尚未生成),供详情页/列表页展示 */
export async function getRecordingReviewStatus(mediaId: string | null): Promise<string | null> {
  if (!mediaId) return null;
  const m = await one<{ review_status: string }>(
    `SELECT review_status FROM media_files WHERE id = ?`, [mediaId]
  ).catch(() => null);
  return m?.review_status ?? null;
}

/**
 * 直播录像被审核驳回:物理删除录像文件 + 软删 media_files。
 * 需求是「驳回即清理,任何人不可再回看」,故这里真删文件,不是只打标记。
 */
export async function purgeLiveRecording(mediaId: string): Promise<boolean> {
  const m = await one<{ storage_key: string; source: string; source_ref: string }>(
    `SELECT storage_key, source, source_ref FROM media_files WHERE id = ?`, [mediaId]
  );
  if (!m || m.source !== 'live') return false;
  if (m.storage_key) await deleteStorageObject(m.storage_key).catch(() => {});
  await exec(`UPDATE media_files SET status='trashed', updated_at=? WHERE id=?`, [ts(), mediaId]);
  await exec(
    `UPDATE live_rooms SET recording_media_id = NULL, updated_at = ? WHERE recording_media_id = ?`,
    [ts(), mediaId]
  );
  console.log(`[live-record] purged rejected recording media=${mediaId} room=${m.source_ref}`);
  return true;
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
    // 删物理文件(本地直接删;S3 调对象存储删除)
    if (r.storage_key) {
      await deleteStorageObject(r.storage_key).catch(() => {});
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
