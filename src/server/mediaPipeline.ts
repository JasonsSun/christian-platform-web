import path from 'path';
import { promises as fs } from 'fs';
import { exec, newId, one, ts } from './db';
import { absFromStorageKey } from './media';
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

/** 相对 public 的路径 -> 同目录新文件名 */
function sibling(storageKey: string, suffix: string, ext: string): { rel: string; abs: string } {
  const dir = path.dirname(storageKey);
  const base = path.basename(storageKey, path.extname(storageKey));
  const rel = `${dir}/${base}${suffix}.${ext}`;
  return { rel, abs: path.join(process.cwd(), 'public', rel) };
}

/**
 * 媒体处理流水线:
 *  视频 -> 探测时长 / (非 mp4 则转码) / 抽取封面
 *  音频 -> 探测时长 / (非 mp3 则转码)
 *  图片 -> 缩略图
 * 返回处理结果
 */
export async function runMediaPipeline(mediaId: string, storageKey: string, kind: string, ext: string) {
  const abs = absFromStorageKey(storageKey);
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
      const okc = await transcodeToMp4(abs, out.abs);
      if (okc) {
        await exec(`UPDATE media_files SET storage_key=?, extension='mp4', mime_type='video/mp4' WHERE id=?`,
          [out.rel, mediaId]);
        result.transcoded = true;
        result.storageKey = out.rel;
        await upsertTask(mediaId, 'transcode', 'done', `已转码为标准 MP4: ${out.rel}`);
      } else {
        await upsertTask(mediaId, 'transcode', 'failed', '', '转码失败');
      }
    } else if (kind === 'video') {
      await upsertTask(mediaId, 'transcode', 'done', '源文件已为 MP4(H.264/AAC)，无需转码');
    }

    if (kind === 'audio' && ext !== 'mp3') {
      const out = sibling(storageKey, '_conv', 'mp3');
      const okc = await normalizeAudio(abs, out.abs);
      if (okc) {
        await exec(`UPDATE media_files SET storage_key=?, extension='mp3', mime_type='audio/mpeg' WHERE id=?`,
          [out.rel, mediaId]);
        result.transcoded = true;
        result.storageKey = out.rel;
        await upsertTask(mediaId, 'audio_normalize', 'done', `已标准化为 MP3: ${out.rel}`);
      } else {
        await upsertTask(mediaId, 'audio_normalize', 'failed', '', '音频转码失败');
      }
    } else if (kind === 'audio') {
      await upsertTask(mediaId, 'audio_normalize', 'done', '源文件已为 MP3，无需转码');
    }

    // 3. 封面 / 缩略图
    if (kind === 'video') {
      const cur = await one<{ storage_key: string }>(`SELECT storage_key FROM media_files WHERE id=?`, [mediaId]);
      const curAbs = absFromStorageKey(cur?.storage_key || storageKey);
      const out = sibling(cur?.storage_key || storageKey, '_poster', 'jpg');
      const okp = await makePoster(curAbs, out.abs, Math.min(3, Math.max(1, Math.floor((result.duration || 4) / 3))));
      if (okp) {
        await exec(`UPDATE media_files SET poster_key=? WHERE id=?`, [out.rel, mediaId]);
        result.poster = out.rel;
        await upsertTask(mediaId, 'poster', 'done', `已生成封面: ${out.rel}`);
      } else {
        await upsertTask(mediaId, 'poster', 'failed', '', '封面抽取失败');
      }
    }

    if (kind === 'image') {
      const out = sibling(storageKey, '_thumb', 'jpg');
      const okt = await makeThumbnail(abs, out.abs, 640);
      if (okt) {
        result.thumbnail = out.rel;
        await upsertTask(mediaId, 'thumbnail', 'done', `已生成缩略图: ${out.rel}`);
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

/** 删除媒体关联的衍生文件(转码产物 / 封面 / 缩略图) */
export async function removeDerived(storageKey: string) {
  const dir = path.dirname(storageKey);
  const base = path.basename(storageKey, path.extname(storageKey));
  for (const suffix of ['_conv.mp4', '_conv.mp3', '_poster.jpg', '_thumb.jpg']) {
    try {
      await fs.unlink(path.join(process.cwd(), 'public', dir, base + suffix));
    } catch { /* 不存在则忽略 */ }
  }
}
