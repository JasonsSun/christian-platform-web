/** 相对时间:3 分钟前 / 2 天前 */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = 60000, hour = 3600000, day = 86400000;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))} 个月前`;
  return `${Math.floor(diff / (day * 365))} 年前`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function countdown(iso?: string | null): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return '';
  if (diff < 0) return '已结束';
  const day = 86400000;
  if (diff >= day) return `${Math.floor(diff / day)} 天后`;
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h} 小时后`;
  return `${Math.max(1, Math.floor(diff / 60000))} 分钟后`;
}

export const initials = (name?: string) => (name || '?').slice(0, 1).toUpperCase();

/** 文件大小格式化 */
export function formatSize(n?: number): string {
  if (!n || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** 媒体类型中文标签 */
export const MEDIA_KIND_LABEL: Record<string, string> = {
  image: '图片', audio: '音乐', video: '视频', score: '曲谱', doc: '资料',
};

/** 媒体审核状态标签 */
export const MEDIA_REVIEW_LABEL: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已驳回',
};
