import { NextRequest, NextResponse } from 'next/server';
import { synthesizeTts, diagnoseTts, warmupTts } from '@/server/tts';

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

  // 预热（幂等）：首次请求时后台探一次 Edge，不通即熔断，避免每个请求都白等 Edge 超时
  warmupTts();

  try {
    // 总预算硬超时：各源内部虽已有超时，但长文本分段累计可能很久；
    // 这里兜住「整次请求」，超时即返回 502，让前端走浏览器直连兜底。
    const totalMs =
      Number(process.env.TTS_TOTAL_TIMEOUT_MS) > 0
        ? Number(process.env.TTS_TOTAL_TIMEOUT_MS)
        : 25000;
    const { buf, provider, cached } = await Promise.race([
      synthesizeTts(text, { voice }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('tts_total_timeout')), totalMs)
      ),
    ]);
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
