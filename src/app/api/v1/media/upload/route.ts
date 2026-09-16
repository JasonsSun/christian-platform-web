import { NextRequest } from 'next/server';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { once } from 'events';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { exec, newId, ts } from '@/server/db';
import { ok, withApi, HttpError, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notifyRole, notify } from '@/server/services';
import { scheduleMediaPipeline } from '@/server/mediaPipeline';
import { validateUpload, extOf, guessMime, kindLabel, publicUrlFor } from '@/server/media';
import { commitToStorage } from '@/server/storage';
import { probeDuration } from '@/server/transcode';
import { assertUploadAllowed, assertDurationAllowed, getQuota, fmtMin, MB } from '@/server/quota';
import { guardWrite } from '@/server/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 绝对硬上限(防误传超大文件),真正的限制由用户等级配额决定 */
const HARD_MAX_BYTES = 4 * 1024 * MB;

/** 流式落盘到临时暂存:边写边算 sha256,避免大文件整体进内存。
 *  返回相对键 rel 与暂存绝对路径 abs;提交阶段再由 commitToStorage 落库/上传。 */
async function streamToDisk(file: File, ext: string) {
  const now = new Date();
  const dir = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const name = `${crypto.randomUUID()}.${ext}`;
  const rel = `${dir}/${name}`;
  const stagingDir = path.join(os.tmpdir(), 'cp-upload');
  await fs.mkdir(stagingDir, { recursive: true });
  const abs = path.join(stagingDir, `${crypto.randomUUID()}.${ext}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  const ws = createWriteStream(abs);
  const rs = Readable.fromWeb(file.stream() as any);
  for await (const chunk of rs) {
    const buf = chunk as Buffer;
    hash.update(buf);
    size += buf.length;
    if (size > HARD_MAX_BYTES) {
      ws.destroy();
      await fs.unlink(abs).catch(() => {});
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '文件超过系统绝对上限 4GB');
    }
    if (!ws.write(buf)) await once(ws, 'drain');
  }
  ws.end();
  await once(ws, 'finish');
  return { rel, abs, size, checksum: hash.digest('hex') };
}

/** 上传媒体(图片/音乐/视频/曲谱/资料):配额校验 → 落盘 → 时长校验 → 建记录 → 待审核 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  await guardWrite(req, 'upload', user.id);

  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) {
    throw new HttpError(422, 'VALIDATION_FAILED', '请使用 multipart/form-data 上传');
  }
  const len = Number(req.headers.get('content-length') || 0);
  if (len > HARD_MAX_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '文件超过系统绝对上限 4GB');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'BAD_REQUEST', '缺少 file 字段');

  const rawName = file.name || 'unnamed';
  const ext = extOf(rawName);
  const mime = file.type || guessMime(ext);
  const title = String(form.get('title') || rawName.replace(/\.[^.]+$/, ''));

  // 1) 类型 / 扩展名 / 基础大小校验
  const v = await validateUpload(rawName, mime, file.size);
  if (!v.ok) throw new HttpError(422, 'VALIDATION_FAILED', v.reason || '文件校验未通过');
  const kind = v.kind;

  // 2) 按用户成长等级校验:单文件大小 / 每日次数 / 每日流量 / 总存储
  const quota = await assertUploadAllowed(user.id, kind, file.size);

  // 3) 流式落盘(不整体占用内存)
  const saved = await streamToDisk(file, ext);

  // 音视频时长校验(超出等级上限则清理暂存并拒绝)
  let duration: number | null = null;
  if (kind === 'video' || kind === 'audio') {
    duration = await probeDuration(saved.abs);
    if (duration && duration > 0) {
      try {
        assertDurationAllowed(kind, duration, quota);
      } catch (e) {
        await fs.unlink(saved.abs).catch(() => {});
        throw e;
      }
    }
  }

  // 4) 提交到存储后端(本地=移入 public/uploads;S3=上传对象),得到最终 storageKey
  const storageKey = await commitToStorage(saved.abs, saved.rel, mime);
  const url = publicUrlFor(storageKey);

  const id = newId('med');
  const processing = kind === 'video' || kind === 'audio';
  const status = processing ? 'transcoding' : 'ready';

  await exec(
    `INSERT INTO media_files
       (id, owner_id, file_name, title, mime_type, extension, kind, size_bytes, checksum,
        storage_key, status, review_status, review_reason, reviewed_by, reviewed_at, ref_count,
        duration_sec, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    [id, user.id, rawName, title, mime, ext, kind, saved.size, saved.checksum,
      storageKey, status, 'pending', '', null, null,
      duration, ts(), ts()]
  );

  // 后台真实处理流水线:安全扫描 / 时长探测 / 转码 / 封面 / 缩略图
  scheduleMediaPipeline(id, storageKey, kind, ext);

  // 上传行为计入画像(发布/上传越多,信任分与配额越高)
  await getQuota(user.id, true).catch(() => {});

  await audit(user.id, 'MEDIA_UPLOAD', 'media', id,
    `上传${kindLabel(kind)}:${rawName}(${(saved.size / MB).toFixed(1)}MB${duration ? `,${duration}s` : ''})`,
    clientIp(req));
  await notifyRole(['moderator', 'admin'], 'media_pending', '新的媒体待审核',
    `${user.display_name} 上传了${kindLabel(kind)}「${title}」`, '/admin/media');
  if (quota.next && quota.next.gap > 0) {
    await notify(user.id, 'quota_levelup_tip', '提升上传额度小贴士',
      `再获得 ${quota.next.gap} 信任分即可升级为「${quota.next.name}」:${quota.next.gains}`, '/upload');
  }

  return ok({
    id, url, kind, kindLabel: kindLabel(kind), fileName: rawName, title,
    mimeType: mime, extension: ext, sizeBytes: saved.size, checksum: saved.checksum,
    durationSec: duration, status, reviewStatus: 'pending', processing,
    quota: {
      level: quota.level, levelName: quota.levelName, trustScore: quota.trustScore,
      maxVideoMb: quota.policy.maxVideoMb, maxAudioMb: quota.policy.maxAudioMb,
      maxVideoDuration: fmtMin(quota.policy.maxVideoSeconds),
      dailyUploads: quota.policy.dailyUploads,
      todayCount: quota.usage.todayCount + 1,
      remainingTotalMb: Math.round(Math.max(0, quota.usage.totalBytesLimit - quota.usage.totalBytes - saved.size) / MB),
      next: quota.next,
    },
  }, 201);
});
