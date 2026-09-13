import { NextRequest, NextResponse } from 'next/server';
import { synthesizeTts, diagnoseTts } from '@/server/tts';

// 服务端 TTS：把经文文本合成 mp3 返回，供不支持 Web Speech API 的浏览器（如安卓微信 WebView）播放。
// 多源 + 硬超时（见 @/server/tts），避免历史问题：微软 Edge TTS 建连挂起导致前端永远「合成中」。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT = 6000;

/** 连通性自检：GET /api/v1/bible/tts?diag=1 */
export async function GET(req: NextRequest) {
  const diag = req.nextUrl.searchParams.get('diag');
  if (!diag) return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
  try {
    const result = await diagnoseTts();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: 'diag_failed', detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: 'text_too_long' }, { status: 413 });

  const voice = typeof body?.voice === 'string' ? body.voice : undefined;

  try {
    const { buf, provider, cached } = await synthesizeTts(text, { voice });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=2592000, immutable',
        'Accept-Ranges': 'bytes',
        'X-Tts-Provider': provider,
        'X-Tts-Cache': cached ? 'HIT' : 'MISS',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'tts_failed', detail: String(e?.message || e) },
      { status: 502 }
    );
  }
}
