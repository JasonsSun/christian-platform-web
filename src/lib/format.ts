/** 时间入参：ISO 串、毫秒时间戳（localStorage 存的）或 Date */
type TimeInput = string | number | Date | null | undefined;

/** 全站唯一的时间解析入口：无效值统一返回 null，调用方按语境决定兜底文案 */
function toDate(v?: TimeInput): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 相对时间:3 分钟前 / 2 天前 */
export function timeAgo(iso?: TimeInput): string {
  const d = toDate(iso);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const min = 60000, hour = 3600000, day = 86400000;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))} 个月前`;
  return `${Math.floor(diff / (day * 365))} 年前`;
}

export function formatDate(iso?: TimeInput): string {
  const d = toDate(iso);
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 时钟 HH:mm —— 后台「更新于」这类只看时刻的地方用，别用 toLocaleTimeString（会冒出 下午06:34） */
export function formatClock(v?: TimeInput): string {
  const d = toDate(v);
  if (!d) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateTime(iso?: TimeInput): string {
  const d = toDate(iso);
  if (!d) return '';
  return `${formatDate(d)} ${formatClock(d)}`;
}

export function countdown(iso?: TimeInput): string {
  const d = toDate(iso);
  if (!d) return '';
  const diff = d.getTime() - Date.now();
  if (diff < 0) return '已结束';
  const day = 86400000;
  if (diff >= day) return `${Math.floor(diff / day)} 天后`;
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h} 小时后`;
  return `${Math.max(1, Math.floor(diff / 60000))} 分钟后`;
}

/**
 * 金额（分）-> 展示文案：千分位，整数不带小数，有角分才保留两位。
 * 站里金额一律「分」存储，之前 4 个接口各写一份、口径还不一样（有的 10000，有的 10000.00），
 * 同一页两处数字对不上。这里只出数字，¥ / 元 由使用处按语境决定。
 * 传 decimals 可强制补零，收银台一类必须看到角分的场景才用。
 */
export function formatMoney(cents?: number | null, decimals?: number): string {
  const y = Number(cents || 0) / 100;
  const fixed =
    decimals !== undefined ? y.toFixed(decimals) : Number.isInteger(y) ? String(y) : y.toFixed(2);
  const [int, dec] = fixed.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped + (dec ? `.${dec}` : '');
}

export const initials = (name?: string) => (name || '?').slice(0, 1).toUpperCase();

/** 文件大小格式化 */
export function formatSize(n?: number): string {
  if (!n || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** IPv4-over-IPv6 前缀只是内部表示，界面上留着像脏数据 */
export function formatIp(ip?: string | null): string {
  const s = String(ip || '').replace(/^::ffff:/, '');
  return s || '-';
}

/** 媒体类型中文标签 */
export const MEDIA_KIND_LABEL: Record<string, string> = {
  image: '图片', audio: '音乐', video: '视频', score: '曲谱', doc: '资料',
};

/** 媒体审核状态标签 */
export const MEDIA_REVIEW_LABEL: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回',
};
