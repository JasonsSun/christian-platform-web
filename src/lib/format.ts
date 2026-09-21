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

/**
 * 时长（秒）-> 口语化文案：27 秒 / 4 分 12 秒 / 1 小时 5 分。
 * 搜索页原来写的是 Math.round(秒/60) + 「分钟」，一条 27 秒的音频就被印成「0 分钟」；
 * 服务端 fmtMin、QuotaCard、后台配额页、直播列表各有自己的版本，口径全不一样。
 */
export function formatDuration(sec?: number | null): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) {
    const rest = s % 60;
    return rest ? `${Math.floor(s / 60)} 分 ${rest} 秒` : `${Math.round(s / 60)} 分钟`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

/** 时长（秒）-> 播放器那种 m:ss（过一小时补成 h:mm:ss）；无时长返回空串，让调用方整段不渲染 */
export function formatTimestamp(sec?: number | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (!s) return '';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${pad2(s % 60)}`;
  return `${Math.floor(m / 60)}:${pad2(m % 60)}:${pad2(s % 60)}`;
}

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
