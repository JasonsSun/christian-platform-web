import { NextRequest } from 'next/server';
import { one } from '@/server/db';
import { ok, withApi, notFound } from '@/server/http';
import { requireRole } from '@/server/auth';
import { absFromStorageKey } from '@/server/media';
import { runMediaPipeline } from '@/server/mediaPipeline';
import { ffmpegAvailable } from '@/server/transcode';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 重新执行媒体处理流水线(探测时长 / 转码 / 抽取封面) */
export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  await requireRole(req, ['admin', 'moderator']);
  const m = await one<any>(`SELECT id, storage_key, kind, extension FROM media_files WHERE id = ?`, [ctx.params.id]);
  if (!m) throw notFound('文件不存在');

  const abs = absFromStorageKey(m.storage_key);
  try {
    await fs.access(abs);
  } catch {
    throw notFound('源文件不存在于磁盘');
  }

  const result = await runMediaPipeline(m.id, m.storage_key, m.kind, m.extension);
  return ok({ id: m.id, ffmpeg: ffmpegAvailable(), result });
});
