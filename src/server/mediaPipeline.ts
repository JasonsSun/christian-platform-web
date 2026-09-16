import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec, newId, one, q, ts } from './db';
import { readToLocalPath, commitToStorage, deleteStorageObject } from './storage';
import {
  ffmpegAvailable, makePoster, makeThumbnail, normalizeAudio, probeDuration, transcodeToMp4,
} from './transcode';
import { scanMediaFile } from './scan';

/* ---------------- 处理任务 ---------------- */

async function upsertTask(mediaId: string, taskType: string, status: 'running' | 'done' | 'failed' | 'skipped',
                          output = '', error = '') {
  const existing = await one<{ id: string }>(
    `SELECT id FROM media_processing_tasks WHERE media_file_id = ? AND task_type = ?`, [mediaId, taskType]
  );
  if (existing) {
    await exec(
      `UPDATE media_processing_tasks SET status=?, output=?, error_message=?, attempts=attempts+1, finished_at=? WHERE id=?`,
      [status, output, error, ts(), existing.id]
    );
    return existing.id;
  }
  const id = newId('mpt');
  await exec(
    `INSERT INTO media_processing_tasks (id, media_file_id, task_type, status, attempts, error_message, output, created_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, mediaId, taskType, status, 1, error, output, ts(), status === 'running' ? null : ts()]
  );
  return id;
}

/** 相对键 -> 同目录新文件名(写入临时目录,处理完再由 commitToStorage 落库/上传) */
function sibling(storageKey: string, suffix: string, ext: string): { rel: string; tmpAbs: string } {
  const dir = path.dirname(storageKey);
  const base = path.basename(storageKey, path.extname(storageKey));
  const rel = `${dir}/${base}${suffix}.${ext}`;
  const tmpAbs = path.join(os.tmpdir(), 'cp-media-out', `${crypto.randomUUID()}.${ext}`);
  return { rel, tmpAbs };
}

/**
 * 媒体处理流水线:
 *  视频 -> 探测时长 / (非 mp4 则转码) / 抽取封面
 *  音频 -> 探测时长 / (非 mp3 则转码)
 *  图片 -> 缩略图
 * 返回处理结果
 */
export async function runMediaPipeline(mediaId: string, storageKey: string, kind: string, ext: string) {
  const abs = await readToLocalPath(storageKey);
  const result: Record<string, any> = { duration: null, transcoded: false, poster: '', thumbnail: '' };

  // 安全扫描:文件头校验 + 危险载体检测(可选 ClamAV)。不通过直接拒收,不进入转码。
  const scan = await scanMediaFile(abs, ext);
  if (!scan.clean) {
    const reason = `安全扫描未通过(${scan.engine}): ${scan.reasons.join('; ')}`;
    await exec(
      `UPDATE media_files SET status='rejected', review_status='rejected', review_reason=?, updated_at=? WHERE id=?`,
      [reason, ts(), mediaId]
    );
    await upsertTask(mediaId, 'scan', 'failed', '', reason);
    return { ...result, rejected: true, reasons: scan.reasons };
  }
  await upsertTask(mediaId, 'scan', 'done', `安全扫描通过(${scan.engine})`);

  if (!ffmpegAvailable()) {
    for (const t of kind === 'video' ? ['transcode', 'poster'] : kind === 'audio' ? ['audio_normalize'] : ['thumbnail']) {
      await upsertTask(mediaId, t, 'skipped', '', '未配置 ffmpeg，已跳过');
    }
    await exec(`UPDATE media_files SET status='ready', updated_at=? WHERE id=?`, [ts(), mediaId]);
    return { ...result, skipped: true };
  }

  try {
    // 1. 探测时长(视频/音频)
    if (kind === 'video' || kind === 'audio') {
      const d = await probeDuration(abs);
      if (d !== null && d > 0) {
        result.duration = d;
        await exec(`UPDATE media_files SET duration_sec=? WHERE id=?`, [d, mediaId]);
      }
    }

    // 2. 转码
    if (kind === 'video' && ext !== 'mp4') {
      const out = sibling(storageKey, '_conv', 'mp4');
      const okc = await transcodeToMp4(abs, out.tmpAbs);
      if (okc) {
        const finalRel = await commitToStorage(out.tmpAbs, out.rel, 'video/mp4');
        await exec(`UPDATE media_files SET storage_key=?, extension='mp4', mime_type='video/mp4' WHERE id=?`,
          [finalRel, mediaId]);
        result.transcoded = true;
        result.storageKey = finalRel;
        await upsertTask(mediaId, 'transcode', 'done', `已转码为标准 MP4: ${finalRel}`);
      } else {
        await upsertTask(mediaId, 'transcode', 'failed', '', '转码失败');
      }
    } else if (kind === 'video') {
      await upsertTask(mediaId, 'transcode', 'done', '源文件已为 MP4(H.264/AAC)，无需转码');
    }

    if (kind === 'audio' && ext !== 'mp3') {
      const out = sibling(storageKey, '_conv', 'mp3');
      const okc = await normalizeAudio(abs, out.tmpAbs);
      if (okc) {
        const finalRel = await commitToStorage(out.tmpAbs, out.rel, 'audio/mpeg');
        await exec(`UPDATE media_files SET storage_key=?, extension='mp3', mime_type='audio/mpeg' WHERE id=?`,
          [finalRel, mediaId]);
        result.transcoded = true;
        result.storageKey = finalRel;
        await upsertTask(mediaId, 'audio_normalize', 'done', `已标准化为 MP3: ${finalRel}`);
      } else {
        await upsertTask(mediaId, 'audio_normalize', 'failed', '', '音频转码失败');
      }
    } else if (kind === 'audio') {
      await upsertTask(mediaId, 'audio_normalize', 'done', '源文件已为 MP3，无需转码');
    }

    // 3. 封面 / 缩略图
    if (kind === 'video') {
      const cur = await one<{ storage_key: string }>(`SELECT storage_key FROM media_files WHERE id=?`, [mediaId]);
      const curAbs = await readToLocalPath(cur?.storage_key || storageKey);
      const out = sibling(cur?.storage_key || storageKey, '_poster', 'jpg');
      const okp = await makePoster(curAbs, out.tmpAbs, Math.min(3, Math.max(1, Math.floor((result.duration || 4) / 3))));
      if (okp) {
        const posterRel = await commitToStorage(out.tmpAbs, out.rel, 'image/jpeg');
        await exec(`UPDATE media_files SET poster_key=? WHERE id=?`, [posterRel, mediaId]);
        result.poster = posterRel;
        await upsertTask(mediaId, 'poster', 'done', `已生成封面: ${posterRel}`);
      } else {
        await upsertTask(mediaId, 'poster', 'failed', '', '封面抽取失败');
      }
    }

    if (kind === 'image') {
      const out = sibling(storageKey, '_thumb', 'jpg');
      const okt = await makeThumbnail(abs, out.tmpAbs, 640);
      if (okt) {
        const thumbRel = await commitToStorage(out.tmpAbs, out.rel, 'image/jpeg');
        result.thumbnail = thumbRel;
        await upsertTask(mediaId, 'thumbnail', 'done', `已生成缩略图: ${thumbRel}`);
      } else {
        await upsertTask(mediaId, 'thumbnail', 'failed', '', '缩略图生成失败');
      }
    }

    await exec(`UPDATE media_files SET status='ready', updated_at=? WHERE id=?`, [ts(), mediaId]);
    return result;
  } catch (e: any) {
    await exec(`UPDATE media_files SET status='failed', updated_at=? WHERE id=?`, [ts(), mediaId]);
    await upsertTask(mediaId, 'process', 'failed', '', e?.message || '处理异常');
    return { ...result, error: e?.message || '处理异常' };
  }
}

/** 后台异步执行,不阻塞上传响应 */
export function scheduleMediaPipeline(mediaId: string, storageKey: string, kind: string, ext: string) {
  void runMediaPipeline(mediaId, storageKey, kind, ext).catch((e) => {
    console.error('[media-pipeline]', mediaId, e?.message);
  });
}

/**
 * 多副本/崩溃恢复：接管「卡在 running」的处理任务，重新跑一遍流水线。
 *
 * 为什么需要：流水线是在处理上传请求的那个进程里异步跑的（scheduleMediaPipeline）。
 * 这个进程被重启 / kill / 滚动发布顶掉之后，任务行会永远停在 running，
 * 用户的媒体就一直显示「处理中」，而且不会有人再来管它 ——
 * 单副本时代重启肉眼可见，多副本部署时副本 A 倒下、副本 B 完全不知道有活没干完，
 * 这个问题会被放大。
 *
 * 做法是一个轻量租约：任何副本启动时都扫一遍「running 且超过陈旧阈值」的任务，
 * 用「UPDATE ... WHERE attempts=旧值」的乐观锁认领；多个副本同时抢时
 * 只有 affectedRows=1 的那个副本会真正重跑，不会重复转码。
 * attempts 达到上限就放弃，避免坏文件被无限重试。
 */
export async function rescueStuckMediaTasks(staleMinutes = 20, maxAttempts = 3): Promise<number> {
  let rows: Array<{
    task_id: string; media_file_id: string; storage_key: string;
    kind: string; extension: string; attempts: number;
  }> = [];
  try {
    rows = await q<any>(
      `SELECT t.id AS task_id, f.id AS media_file_id, f.storage_key, f.kind, f.extension, t.attempts
         FROM media_processing_tasks t
         JOIN media_files f ON f.id = t.media_file_id
        WHERE t.status = 'running'
          AND t.attempts < ?
          AND t.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
        LIMIT 20`,
      [maxAttempts, staleMinutes]
    );
  } catch {
    // 表还没建好（首次迁移未完成）/ DB 抖动：不影响启动，下一轮再试
    return 0;
  }

  let claimed = 0;
  for (const r of rows) {
    const res = await exec(
      `UPDATE media_processing_tasks SET attempts = attempts + 1
        WHERE id = ? AND attempts = ? AND status = 'running'`,
      [r.task_id, r.attempts]
    ).catch(() => null);
    // 抢不到说明被别的副本接走了，或状态已被它自己改成 done/failed
    if (!res || res.affectedRows !== 1) continue;
    claimed += 1;
    scheduleMediaPipeline(r.media_file_id, r.storage_key, r.kind, r.extension);
  }
  if (claimed > 0) {
    console.warn(`[media-pipeline] 接管 ${claimed} 个超时未完成的媒体处理任务`);
  }
  return claimed;
}

/** 删除媒体关联的衍生文件(转码产物 / 封面 / 缩略图) */
export async function removeDerived(storageKey: string) {
  const dir = path.dirname(storageKey);
  const base = path.basename(storageKey, path.extname(storageKey));
  for (const suffix of ['_conv.mp4', '_conv.mp3', '_poster.jpg', '_thumb.jpg']) {
    await deleteStorageObject(`${dir}/${base}${suffix}`).catch(() => {});
  }
}
