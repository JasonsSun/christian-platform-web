import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from 'node-edge-tts';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// 服务端 TTS:把经文文本合成 mp3 返回,供不支持 Web Speech API 的浏览器(如安卓微信 WebView)播放。
// 纯 Node 实现(node-edge-tts 调用微软 Edge 在线 TTS,免费无需密钥)。带磁盘缓存避免重复合成。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(os.tmpdir(), 'covenant-tts');
const MAX_TEXT = 6000;
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawText = typeof body?.text === 'string' ? body.text : '';
  const text = rawText.trim();
  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: 'text_too_long' }, { status: 413 });

  let voice = typeof body?.voice === 'string' ? body.voice : DEFAULT_VOICE;
  if (!/^[\w-]+$/.test(voice)) voice = DEFAULT_VOICE;

  const key = createHash('md5').update(`${voice}|${text}`).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.mp3`);

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    let buf: Buffer;
    try {
      buf = await fs.readFile(file); // 缓存命中
    } catch {
      const proxy = process.env.TTS_PROXY;
      const tts = new EdgeTTS({
        voice,
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        timeout: 20000,
        ...(proxy ? { proxy } : {}),
      });
      await tts.ttsPromise(text, file);
      buf = await fs.readFile(file);
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=2592000, immutable',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e: any) {
    try {
      await fs.unlink(file);
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: 'tts_failed', detail: String(e?.message || e) },
      { status: 502 }
    );
  }
}
