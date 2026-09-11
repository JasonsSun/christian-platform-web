// 图形验证码与失败限流（纯 Node 内置模块实现，无第三方依赖）
import { randomBytes } from 'crypto';

/**
 * 验证码数据：仅服务端持有，前端只拿到 id 与 svg 图片。
 * 用 globalThis 挂载 Map，避免 Next.js 开发模式模块重载导致内存丢失。
 */
interface CaptchaItem {
  code: string; // 正确验证码（大写）
  expiresAt: number; // 过期时间戳（ms）
}

interface AttemptItem {
  count: number; // 连续失败次数
  blockedUntil: number; // 被限流截止时间戳（ms）
}

const g = globalThis as any;
const captchas: Map<string, CaptchaItem> = g.__captchaStore || (g.__captchaStore = new Map());
const attempts: Map<string, AttemptItem> = g.__captchaAttemptStore || (g.__captchaAttemptStore = new Map());

// 验证码有效期与限流参数
const CAPTCHA_TTL = 5 * 60 * 1000; // 5 分钟
const MAX_ATTEMPTS = 5; // 连续失败次数上限
const BLOCK_WINDOW = 10 * 60 * 1000; // 限流时长 10 分钟

// 可选字符：数字 + 大写字母，去掉易混淆的 0/O/1/I/L
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 生成 n 位随机验证码 */
function generateCode(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

/** [min, max) 区间随机整数 */
function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/* ---------------- 5x7 点阵字形 ----------------
 * 关键安全点：验证码字符**绝不能**以 <text> 明文出现在 SVG 里，
 * 否则机器人直接解析 DOM 就能拿到答案，验证码形同虚设。
 * 这里把每个字符渲染成点阵（一堆 <circle>），DOM 中不存在可读文本。
 */
const GLYPHS: Record<string, string[]> = {
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

/** 清理过期验证码（生成时顺带执行，避免起定时器） */
function cleanExpired() {
  const now = Date.now();
  for (const [id, item] of captchas) {
    if (item.expiresAt < now) captchas.delete(id);
  }
}

/** 拼装内联 SVG 验证码（噪点线条 + 字符随机旋转/变色） */
function svgCaptcha(code: string): string {
  const W = 120;
  const H = 44;
  const colors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4f46e5'];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  // 背景
  svg += `<rect width="${W}" height="${H}" fill="#f1f5f9"/>`;
  // 干扰线
  for (let i = 0; i < 6; i++) {
    const x1 = rnd(0, W);
    const y1 = rnd(0, H);
    const x2 = rnd(0, W);
    const y2 = rnd(0, H);
    const stroke = colors[rnd(0, colors.length)];
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${rnd(1, 2)}" opacity="0.35"/>`;
  }
  // 噪点
  for (let i = 0; i < 26; i++) {
    const cx = rnd(0, W);
    const cy = rnd(0, H);
    const r = rnd(1, 2);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[rnd(0, colors.length)]}" opacity="0.4"/>`;
  }
  // 字符：5x7 点阵，逐点抖动 + 整体轻微旋转，DOM 中不含任何明文文本
  const chars = code.split('');
  const cell = 4.2; // 单个点阵格边长
  const gw = 5 * cell; // 字形宽
  const gh = 7 * cell; // 字形高
  const gap = 5; // 字间距
  const totalW = chars.length * gw + (chars.length - 1) * gap;
  let x0 = (W - totalW) / 2;

  for (let i = 0; i < chars.length; i++) {
    const glyph = GLYPHS[chars[i]];
    const color = colors[rnd(0, colors.length)];
    const rot = rnd(-12, 13);
    const baseX = x0 + i * (gw + gap);
    const baseY = (H - gh) / 2 + rnd(-2, 3);
    const cx = baseX + gw / 2;
    const cy = baseY + gh / 2;
    svg += `<g transform="rotate(${rot} ${cx} ${cy})">`;
    if (glyph) {
      for (let r = 0; r < 7; r++) {
        const row = glyph[r];
        for (let c = 0; c < 5; c++) {
          if (row[c] !== '#') continue;
          // 每个点加抖动，避免模板匹配；同时略微随机半径
          const px = baseX + c * cell + cell / 2 + (Math.random() - 0.5) * 1.1;
          const py = baseY + r * cell + cell / 2 + (Math.random() - 0.5) * 1.1;
          svg += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${(1.5 + Math.random() * 0.5).toFixed(2)}" fill="${color}"/>`;
        }
      }
    }
    svg += `</g>`;
  }

  // 同色诱饵点：与真实点阵混杂，增加自动分割难度
  for (let i = 0; i < 34; i++) {
    const cx = rnd(4, W - 4);
    const cy = rnd(4, H - 4);
    svg += `<circle cx="${cx}" cy="${cy}" r="${(1.2 + Math.random() * 0.6).toFixed(2)}" fill="${colors[rnd(0, colors.length)]}" opacity="0.55"/>`;
  }
  svg += `</svg>`;
  return svg;
}

/** 创建验证码，返回前端可用的 id 与 svg（code 仅存服务端） */
export function createCaptcha(): { id: string; svg: string } {
  cleanExpired();
  const id = 'cap_' + randomBytes(9).toString('hex');
  const code = generateCode(4);
  captchas.set(id, { code, expiresAt: Date.now() + CAPTCHA_TTL });
  return { id, svg: svgCaptcha(code) };
}

/** 校验验证码：一次性，校验后立即删除 */
export function verifyCaptcha(id?: string, code?: string): boolean {
  if (!id || !code) return false;
  const item = captchas.get(id);
  if (!item) return false;
  if (item.expiresAt < Date.now()) {
    captchas.delete(id);
    return false;
  }
  const ok = item.code === String(code).trim().toUpperCase();
  captchas.delete(id); // 一次性使用
  return ok;
}

/** 判断该 key（通常按 IP）是否处于限流中 */
export function isBlocked(key: string): boolean {
  const item = attempts.get(key);
  if (!item) return false;
  if (item.blockedUntil > Date.now()) return true;
  // 限流已过期则清理
  attempts.delete(key);
  return false;
}

/** 记录一次失败，达到阈值则进入限流 */
export function recordFailure(key: string): void {
  const item = attempts.get(key) || { count: 0, blockedUntil: 0 };
  // 已在限流期则保持不变
  if (item.blockedUntil > Date.now()) return;
  item.count += 1;
  if (item.count >= MAX_ATTEMPTS) {
    item.blockedUntil = Date.now() + BLOCK_WINDOW;
    item.count = 0;
  }
  attempts.set(key, item);
}

/** 成功后重置失败计数 */
export function resetAttempts(key: string): void {
  attempts.delete(key);
}
