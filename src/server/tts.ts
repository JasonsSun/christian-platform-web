import { EdgeTTS } from 'node-edge-tts';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * 服务端语音合成（供无 Web Speech API 的浏览器，如安卓微信 WebView 使用）。
 *
 * 背景 / 踩坑记录：
 * - 原实现直接用 `node-edge-tts`（微软 Edge 在线 TTS，免密钥）。该包内部
 *   `_connectWebSocket()` 只监听 `open`/`error`，**没有握手超时**；它自己的
 *   `timeout` 参数是在「建连成功之后」才生效的。
 * - 结果：在国内机房直连 `speech.platform.bing.com` 时，若 TCP/TLS 握手被丢包
 *   （GFW 常见表现），`await` 会**永久挂起** → 路由永不返回 → 前端永远显示「合成中…」。
 *
 * 因此这里做了三层防护：
 * 1) 硬超时：用 Promise.race 兜住整个合成过程（含建连阶段），保证一定返回；
 * 2) 熔断：Edge 连续失败后短期内直接走国内可达的降级源，不让用户白等；
 * 3) 降级源：百度翻译 TTS（免密钥、国内可达），按标点分段合成后拼接为单个 mp3。
 *
 * 环境变量（均可选）：
 * - TTS_PROVIDER=edge|baidu|auto（默认 auto：edge 优先，失败自动降级 baidu）
 * - TTS_PROXY=http://host:port（Edge 走代理，适用于 VPS 无法出境的情况）
 * - TTS_EDGE_TIMEOUT_MS（默认 12000）
 * - TTS_BAIDU_TIMEOUT_MS（默认 12000）
 */

const CACHE_DIR = path.join(os.tmpdir(), 'covenant-tts');
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const EDGE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** Edge 单次 SSML 文本上限（过长会让 WebSocket 消息过大 / 合成过慢） */
const EDGE_SEG_CHARS = 1200;
/** 百度接口实测 ~500 字上限，取保守值避免 503 */
const BAIDU_SEG_CHARS = 350;

function envNum(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const EDGE_TIMEOUT_MS = envNum(process.env.TTS_EDGE_TIMEOUT_MS, 12000);
const BAIDU_TIMEOUT_MS = envNum(process.env.TTS_BAIDU_TIMEOUT_MS, 12000);

export type TtsProvider = 'edge' | 'baidu' | 'cache';

export interface TtsResult {
  buf: Buffer;
  provider: TtsProvider;
  cached: boolean;
  ms: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** 按句末标点切分长文本，再累积到不超过 max 字（保持语义完整） */
function splitText(text: string, max: number): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const sents = t.split(/(?<=[。！？!?；;\n])/).filter((s) => s.length > 0);
  const out: string[] = [];
  let buf = '';
  for (const s of sents) {
    if (buf && buf.length + s.length > max) {
      out.push(buf);
      buf = '';
    }
    buf += s;
    // 单句本身超长（如无标点的长串）→ 硬切
    while (buf.length > max) {
      out.push(buf.slice(0, max));
      buf = buf.slice(max);
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- Edge TTS

interface EdgeOpts {
  proxy?: string;
  timeoutMs: number;
}

async function synthesizeEdge(text: string, voice: string, opts: EdgeOpts): Promise<Buffer> {
  const tts = new EdgeTTS({
    voice,
    outputFormat: EDGE_OUTPUT_FORMAT,
    timeout: opts.timeoutMs,
    ...(opts.proxy ? { proxy: opts.proxy } : {}),
  });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const tmp = path.join(CACHE_DIR, `edge-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    // 关键：node-edge-tts 的 timeout 不覆盖 WebSocket 建连阶段，这里用 race 兜底整段过程
    await Promise.race([
      tts.ttsPromise(text, tmp),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('edge_timeout')), opts.timeoutMs + 2000)
      ),
    ]);
    const buf = await fs.readFile(tmp);
    if (!buf.length) throw new Error('edge_empty_audio');
    return buf;
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

async function synthesizeEdgeLong(text: string, voice: string, opts: EdgeOpts): Promise<Buffer> {
  const segs = splitText(text, EDGE_SEG_CHARS);
  if (segs.length <= 1) return synthesizeEdge(segs[0] || '', voice, opts);
  const parts: Buffer[] = [];
  for (const s of segs) parts.push(await synthesizeEdge(s, voice, opts));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- 百度 TTS（国内可达降级源）

async function synthesizeBaidu(text: string, opts: { timeoutMs: number }): Promise<Buffer> {
  const segs = splitText(text, BAIDU_SEG_CHARS);
  const parts: Buffer[] = [];
  for (let i = 0; i < segs.length; i++) {
    const url =
      'https://fanyi.baidu.com/gettts?lan=zh&spd=5&source=web&text=' +
      encodeURIComponent(segs[i]);
    const res = await fetchWithTimeout(url, opts.timeoutMs);
    if (!res.ok) throw new Error(`baidu_http_${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('audio')) throw new Error('baidu_not_audio');
    const ab = await res.arrayBuffer();
    if (!ab.byteLength) throw new Error('baidu_empty_audio');
    parts.push(Buffer.from(ab));
    if (i < segs.length - 1) await sleep(150); // 轻节流，避免被限流 503
  }
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- 熔断

let edgeFailStreak = 0;
let edgeBlockedUntil = 0;
// Edge 通不通常态化（国内机房直连微软 TTS），失败一次就冷却，避免每次请求都白等十余秒
const EDGE_FAIL_THRESHOLD = 1;
const EDGE_COOLDOWN_MS = 3 * 60 * 1000;

function markEdgeFail() {
  edgeFailStreak += 1;
  if (edgeFailStreak >= EDGE_FAIL_THRESHOLD) edgeBlockedUntil = Date.now() + EDGE_COOLDOWN_MS;
}
function markEdgeOk() {
  edgeFailStreak = 0;
  edgeBlockedUntil = 0;
}

function providerOrder(): Exclude<TtsProvider, 'cache'>[] {
  const cfg = (process.env.TTS_PROVIDER || 'auto').toLowerCase();
  if (cfg === 'edge') return ['edge'];
  if (cfg === 'baidu') return ['baidu'];
  // auto：Edge 近期限不会成功，就直接走百度，避免每次白等十几秒
  return Date.now() < edgeBlockedUntil ? ['baidu', 'edge'] : ['edge', 'baidu'];
}

// ---------------------------------------------------------------- 缓存 & 并发去重

const inflight = new Map<string, Promise<{ buf: Buffer; provider: TtsProvider }>>();

async function readCache(file: string): Promise<Buffer | null> {
  try {
    const buf = await fs.readFile(file);
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 对外入口

export function normalizeVoice(voice?: string): string {
  return voice && /^[\w-]+$/.test(voice) ? voice : DEFAULT_VOICE;
}

/**
 * 合成语音，返回 mp3 Buffer。带磁盘缓存与并发去重。
 * 按 TTS_PROVIDER / 熔断状态依次尝试各源，全部失败才抛错。
 */
export async function synthesizeTts(
  text: string,
  opts: { voice?: string } = {}
): Promise<TtsResult> {
  const voice = normalizeVoice(opts.voice);
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('empty_text');

  const key = md5(`${voice}|${trimmed}`);
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const cached = await readCache(file);
  if (cached) return { buf: cached, provider: 'cache', cached: true, ms: 0 };

  let task = inflight.get(key);
  if (!task) {
    task = (async () => {
      const order = providerOrder();
      let lastErr: unknown;
      for (const p of order) {
        try {
          const buf =
            p === 'edge'
              ? await synthesizeEdgeLong(trimmed, voice, {
                  proxy: process.env.TTS_PROXY,
                  timeoutMs: EDGE_TIMEOUT_MS,
                })
              : await synthesizeBaidu(trimmed, { timeoutMs: BAIDU_TIMEOUT_MS });
          if (p === 'edge') markEdgeOk();
          await fs.writeFile(file, buf).catch(() => {});
          return { buf, provider: p as TtsProvider };
        } catch (e) {
          lastErr = e;
          if (p === 'edge') markEdgeFail();
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('tts_all_providers_failed');
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, task);
  }

  const { buf, provider } = await task;
  return { buf, provider, cached: false, ms: 0 };
}

/** 连通性自检：部署后在浏览器访问 GET /api/v1/bible/tts?diag=1 即可看到各源状态 */
export async function diagnoseTts(): Promise<Record<string, unknown>> {
  const probe = async (fn: () => Promise<Buffer>) => {
    const t0 = Date.now();
    try {
      const b = await fn();
      return { ok: true, ms: Date.now() - t0, bytes: b.length };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
    }
  };
  const sample = '语音合成连通性测试。';
  return {
    provider: process.env.TTS_PROVIDER || 'auto',
    proxyConfigured: !!process.env.TTS_PROXY,
    edgeBlocked: Date.now() < edgeBlockedUntil,
    edgeFailStreak,
    edge: await probe(() =>
      synthesizeEdge(sample, DEFAULT_VOICE, {
        proxy: process.env.TTS_PROXY,
        timeoutMs: envNum(process.env.TTS_DIAG_TIMEOUT_MS, 8000),
      })
    ),
    baidu: await probe(() =>
      synthesizeBaidu(sample, { timeoutMs: envNum(process.env.TTS_DIAG_TIMEOUT_MS, 8000) })
    ),
  };
}
