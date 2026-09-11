import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { one } from './db';

/* ---------------- 类型判定 ---------------- */

export type MediaKind = 'image' | 'audio' | 'video' | 'score' | 'doc';

const EXT_TO_KIND: Record<string, MediaKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', flac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  pdf: 'score', doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', txt: 'doc', md: 'doc', xls: 'doc', xlsx: 'doc',
};

const KIND_LABEL: Record<MediaKind, string> = {
  image: '图片', audio: '音乐', video: '视频', score: '曲谱', doc: '资料',
};

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function kindOf(name: string, mime = ''): MediaKind | null {
  const ext = extOf(name);
  if (EXT_TO_KIND[ext]) return EXT_TO_KIND[ext];
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'score';
  return null;
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as MediaKind] || kind;
}

/** 允许的扩展名白名单(按类型) */
const ALLOWED: Record<MediaKind, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi'],
  score: ['pdf'],
  doc: ['doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'xls', 'xlsx', 'pdf'],
};

/**
 * 系统绝对上限(MB):仅用于兜底,防止极端文件。
 * 面向用户的真实限额由「成长等级配额」quota_policies 决定(见 server/quota.ts),
 * 新用户默认远低于此值,随信任分提升逐步放开。
 */
const DEFAULT_MAX_MB: Record<MediaKind, number> = { image: 50, audio: 600, video: 4000, score: 300, doc: 300 };

export async function getSetting(key: string, def = ''): Promise<string> {
  try {
    const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key_name = ?`, [key]);
    return row?.value ?? def;
  } catch {
    return def;
  }
}

export type ValidateResult = { ok: boolean; kind: MediaKind; reason?: string };

export async function validateUpload(name: string, mime: string, sizeBytes: number): Promise<ValidateResult> {
  const ext = extOf(name);
  const kind = kindOf(name, mime);
  if (!kind) return { ok: false, reason: `不支持的文件类型(.${ext || '未知'})`, kind: 'doc' };
  if (!ALLOWED[kind].includes(ext)) {
    return { ok: false, reason: `扩展名 .${ext} 不允许，可用:${ALLOWED[kind].join('/')}`, kind };
  }
  // 大小上限:优先读设置
  const setKey = `upload.max_${kind}_mb`;
  const configured = await getSetting(setKey, '');
  const maxMb = Number(configured) > 0 ? Number(configured) : DEFAULT_MAX_MB[kind];
  if (sizeBytes > maxMb * 1024 * 1024) {
    return { ok: false, reason: `文件超过上限 ${maxMb}MB(当前 ${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`, kind };
  }
  if (sizeBytes <= 0) return { ok: false, reason: '文件为空', kind };
  return { ok: true, kind };
}

/** 静态资源相对 URL(存 public/uploads) */
export function publicUrlFor(storageKey: string): string {
  return '/' + storageKey.replace(/\\/g, '/');
}

export function absFromStorageKey(storageKey: string): string {
  return path.join(process.cwd(), 'public', storageKey);
}

/** 落盘并返回 storageKey(相对 public) */
export async function saveFile(buf: Buffer, ext: string): Promise<string> {
  const now = new Date();
  const dir = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const absDir = path.join(process.cwd(), 'public', dir);
  await fs.mkdir(absDir, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(absDir, name), buf);
  return `${dir}/${name}`;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** MIME 兜底推断 */
export function guessMime(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain', md: 'text/markdown',
  };
  return map[ext] || 'application/octet-stream';
}
