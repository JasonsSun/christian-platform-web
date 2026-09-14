import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 动态社交分享封面（og:image）。
 * GET /api/og?t=标题&s=摘要&k=类型&m=出处
 *
 * 健壮性设计 —— 目标：**任何情况下都不返回 500、不挂起**，爬虫永远拿得到图。
 *  1. 渲染成功        → 200 动态 PNG
 *  2. 字体缺失        → 200 静态封面（直接返回字节，不重定向）
 *  3. 渲染同步抛错    → 200 静态封面
 *  4. 渲染挂起/异步失败 → 超时（6s）后 200 静态封面
 *     （next/og 底层 @vercel/og 在部分平台会在 ReadableStream 内部异步失败，
 *      业务 try/catch 捕获不到，必须靠超时兜底）
 *  5. 静态封面也读不到 → 302 重定向（用请求真实 Host，不会退化成 localhost）
 *  6. 入参统一截断，避免超长文本撑爆排版
 */
export const runtime = 'nodejs';

const W = 1200;
const H = 630;
const RENDER_TIMEOUT_MS = 6000;

const SITE_HOST = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://amen.dpdns.org')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

let fontCache: Buffer | null | undefined;
let coverCache: Buffer | null | undefined;

function loadFont(): Buffer | null {
  if (fontCache !== undefined) return fontCache;
  try {
    fontCache = fs.readFileSync(path.join(process.cwd(), 'src', 'assets', 'fonts', 'og-subset.ttf'));
  } catch (e: any) {
    console.warn('[og] subset font unavailable, fallback to static cover:', e?.message || e);
    fontCache = null;
  }
  return fontCache;
}

function staticCover(): Buffer | null {
  if (coverCache !== undefined) return coverCache;
  try {
    coverCache = fs.readFileSync(path.join(process.cwd(), 'public', 'og-cover.png'));
  } catch (e: any) {
    console.warn('[og] static cover unreadable:', e?.message || e);
    coverCache = null;
  }
  return coverCache;
}

/** 基督教主题插图（随机/稳定二选一，见 pickIllust），与卡片蓝金底色同色系 */
const ILLUSTS = ['dove.jpg', 'angel.jpg', 'shepherd.jpg'];
const illustCache: Record<string, Buffer | null> = {};

function loadIllust(name: string): Buffer | null {
  if (illustCache[name] !== undefined) return illustCache[name];
  try {
    illustCache[name] = fs.readFileSync(path.join(process.cwd(), 'public', 'og-illust', name));
  } catch (e: any) {
    console.warn('[og] illustration unavailable:', name, e?.message || e);
    illustCache[name] = null;
  }
  return illustCache[name];
}

/**
 * 按内容挑插图：用 title|kind|meta 做稳定散列。
 * 同一篇文章永远拿同一张图（否则每次请求都变，缓存失效、分享预览闪动），
 * 不同内容则分散到不同插图。想指定某张可传 ?i=0|1|2。
 */
function pickIllust(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ILLUSTS[Math.abs(h) % ILLUSTS.length];
}

/** 统一的降级出口：优先回静态封面字节；实在读不到才重定向 */
function fallbackToCover(req: NextRequest): NextResponse {
  const cover = staticCover();
  if (cover && cover.length > 200) {
    return new NextResponse(new Uint8Array(cover), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(cover.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host');
  const base = host ? `${proto}://${host}` : `https://${SITE_HOST}`;
  return NextResponse.redirect(new URL('/og-cover.png', base), 302);
}

/** 超时返回 null，避免底层挂起导致请求永不结束 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function titleSize(len: number): number {
  if (len <= 12) return 78;
  if (len <= 20) return 64;
  if (len <= 32) return 54;
  if (len <= 48) return 46;
  return 40;
}

function clean(v: string | null, max: number): string {
  if (!v) return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function GET(req: NextRequest) {
  const font = loadFont();
  if (!font) return fallbackToCover(req);

  const sp = req.nextUrl.searchParams;
  const title = clean(sp.get('t'), 60) || '圣约社区';
  const sub = clean(sp.get('s'), 90);
  const kind = clean(sp.get('k'), 8);
  const meta = clean(sp.get('m'), 44);

  // 插图：?i=0|1|2 指定；否则按内容稳定散列随机挑一张
  const picked = sp.get('i') !== null
    ? ILLUSTS[Math.abs(Number(sp.get('i')) || 0) % ILLUSTS.length]
    : pickIllust(`${title}|${kind}|${meta}`);
  const illustBuf = loadIllust(picked);
  const illustUri = illustBuf && illustBuf.length > 200
    ? `data:image/jpeg;base64,${illustBuf.toString('base64')}`
    : null;

  try {
    const img = new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            background: 'linear-gradient(135deg, #1e2664 0%, #3d52d9 55%, #4f6df5 100%)',
            padding: '62px 72px',
            color: '#ffffff',
            fontFamily: 'og',
          }}
        >
          {/* 装饰光斑 */}
          <div
            style={{
              position: 'absolute',
              right: -130,
              top: -150,
              width: 480,
              height: 480,
              borderRadius: '50%',
              background: 'rgba(251, 191, 36, 0.16)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: -110,
              bottom: -170,
              width: 430,
              height: 430,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
            }}
          />

          {/* 顶部：品牌 + 类型 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: '#fbbf24',
                  color: '#1e2664',
                  fontSize: 28,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                }}
              >
                约
              </div>
              <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '1px' }}>圣约社区</div>
            </div>
            {kind ? (
              <div
                style={{
                  fontSize: 21,
                  padding: '9px 22px',
                  borderRadius: 999,
                  background: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.28)',
                }}
              >
                {kind}
              </div>
            ) : null}
          </div>

          {/* 主体：左文字 + 右插图 */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
                paddingRight: 40,
              }}
            >
              <div
                style={{
                  fontSize: titleSize(title.length),
                  fontWeight: 700,
                  lineHeight: 1.34,
                  letterSpacing: '0.5px',
                }}
              >
                {title}
              </div>
              {sub ? (
                <div
                  style={{
                    marginTop: 26,
                    fontSize: 25,
                    lineHeight: 1.55,
                    color: 'rgba(255, 255, 255, 0.82)',
                  }}
                >
                  {sub}
                </div>
              ) : null}
            </div>

            {illustUri ? (
              <div
                style={{
                  display: 'flex',
                  width: 330,
                  height: 330,
                  borderRadius: 34,
                  overflow: 'hidden',
                  flexShrink: 0,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: 'rgba(251, 191, 36, 0.42)',
                  boxShadow: '0 26px 64px rgba(0, 0, 0, 0.38)',
                }}
              >
                {/* 插图：深蓝底 + 金色线条，与卡片同色系 */}
                <img
                  src={illustUri}
                  width={330}
                  height={330}
                  style={{ width: 330, height: 330, objectFit: 'cover', borderRadius: 34 }}
                />
              </div>
            ) : null}
          </div>

          {/* 底部 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 23, color: 'rgba(255, 255, 255, 0.72)' }}>
              {meta || '圣经 · 诗歌 · 见证 · 团契'}
            </div>
            <div style={{ fontSize: 23, color: 'rgba(255, 255, 255, 0.72)' }}>{SITE_HOST}</div>
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: [
          { name: 'og', data: font, weight: 400, style: 'normal' },
          { name: 'og', data: font, weight: 700, style: 'normal' },
        ],
      }
    );

    const buf = await withTimeout(img.arrayBuffer(), RENDER_TIMEOUT_MS);
    if (!buf || buf.byteLength < 200) {
      console.warn('[og] render timeout or empty body, fallback to static cover');
      return fallbackToCover(req);
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch (e: any) {
    console.error('[og] render failed:', e?.message || e);
    return fallbackToCover(req);
  }
}
