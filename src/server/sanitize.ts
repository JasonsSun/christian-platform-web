/** 入参健壮化：避免客户端传入非字符串(如数字/对象)导致 .trim() 抛 TypeError 被 withApi 兜成 500 且无痕。 */

export function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 仅保留可见字符的 trimmed 字符串；空/非法返回 fallback */
export function clean(v: unknown, fallback = ''): string {
  const s = str(v).trim();
  return s || fallback;
}
