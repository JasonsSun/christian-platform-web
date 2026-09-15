/**
 * 纯前端文件下载（不经过后端，也不需要弹窗）。
 * 用于「笔记导出 Markdown」「灵修日记导出」等把用户数据交还给用户的场景。
 */

export function downloadText(filename: string, text: string, mime = 'text/markdown;charset=utf-8'): void {
  // 加 BOM 让 Windows 记事本/Excel 正确识别 UTF-8，避免中文乱码
  const blob = new Blob(['\ufeff', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分浏览器(Safari)来不及开始下载,延后释放
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 生成安全的文件名片段（去掉路径分隔符与首尾空白） */
export function safeFilename(s: string): string {
  return (s || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
