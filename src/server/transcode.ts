import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 真实媒体处理:调用 ffmpeg 探测时长 / 抽取封面 / 转码。
 * ffmpeg 不存在时全部安全降级(返回 null,任务标记为 skipped)。
 */

/** 从 cwd 向上查找 bin/ffmpeg(.exe) */
export function findFfmpeg(): string | null {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, 'bin', exe);
    try {
      // 同步探测存在性
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const st = require('fs').statSync(cand);
      if (st.isFile()) return cand;
    } catch {
      /* 继续向上 */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function run(exe: string, args: string[], timeoutMs = 180_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err: any, _stdout, stderr) => {
        resolve({ code: err ? (err.code ?? 1) : 0, stderr: String(stderr || '') });
      });
  });
}

/** 探测时长(秒) */
export async function probeDuration(absFile: string): Promise<number | null> {
  const exe = findFfmpeg();
  if (!exe) return null;
  const { code, stderr } = await run(exe, ['-hide_banner', '-i', absFile], 30_000);
  if (code === 0 || stderr) {
    const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(stderr);
    if (m) {
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      return Math.round(sec);
    }
  }
  return null;
}

/** 抽取封面(视频第 N 秒 / 图片缩放) */
export async function makePoster(absFile: string, outAbs: string, atSec = 2): Promise<boolean> {
  const exe = findFfmpeg();
  if (!exe) return false;
  try {
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
  } catch { /* ignore */ }
  const { code } = await run(exe, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(atSec), '-i', absFile,
    '-frames:v', '1', '-q:v', '3', outAbs,
  ], 60_000);
  if (code !== 0) {
    // 回退:从第 0 秒取
    const r = await run(exe, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', absFile, '-frames:v', '1', '-q:v', '3', outAbs,
    ], 60_000);
    return r.code === 0;
  }
  return true;
}

/** 视频转码为标准 MP4(H.264 + AAC),浏览器可直接播放 */
export async function transcodeToMp4(srcAbs: string, outAbs: string): Promise<boolean> {
  const exe = findFfmpeg();
  if (!exe) return false;
  const { code } = await run(exe, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcAbs,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    outAbs,
  ]);
  return code === 0;
}

/** 音频标准化为 MP3,浏览器可直接播放 */
export async function normalizeAudio(srcAbs: string, outAbs: string): Promise<boolean> {
  const exe = findFfmpeg();
  if (!exe) return false;
  const { code } = await run(exe, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcAbs,
    '-codec:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    outAbs,
  ]);
  return code === 0;
}

/** 图片生成缩略图 */
export async function makeThumbnail(srcAbs: string, outAbs: string, width = 640): Promise<boolean> {
  const exe = findFfmpeg();
  if (!exe) return false;
  const { code } = await run(exe, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcAbs, '-vf', `scale=${width}:-2`, '-q:v', '4', outAbs,
  ], 60_000);
  return code === 0;
}

export function ffmpegAvailable(): boolean {
  return findFfmpeg() !== null;
}
