'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE, tokenStore } from '@/lib/api';
import { formatSize } from '@/lib/format';
import {
  IconCheck,
  IconClose,
  IconDocument,
  IconFilm,
  IconFolder,
  IconImage,
  IconMusicNote,
  IconUpload,
} from '@/components/icons';

/* ---------------- 类型 ---------------- */

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

export interface UploadResult {
  id: string;
  url: string;
  kind: string;
  kindLabel: string;
  fileName: string;
  title: string;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  durationSec?: number | null;
  status: string;
  reviewStatus: string;
  processing: boolean;
}

export interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  result?: UploadResult;
  xhr?: XMLHttpRequest;
}

interface MediaUploaderProps {
  /** 允许的文件类型,对应 input accept */
  accept?: string;
  /** 是否支持多文件 */
  multiple?: boolean;
  /** 最大文件数(仅 multiple 时生效) */
  maxFiles?: number;
  /** 单文件大小上限(字节) */
  maxSize?: number;
  /** 上传成功回调 */
  onSuccess?: (result: UploadResult, file: File) => void;
  /** 标题(可选),不传则用文件名 */
  title?: string;
  /** 自定义类名 */
  className?: string;
}

/* ---------------- 工具 ---------------- */

function fileKind(file: File): string {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md'].includes(ext)) return 'doc';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video';
  return 'doc';
}

/** 文件类型徽标：kind 由本地 fileKind() 推出，不走数据里的 emoji */
function kindIcon(kind: string) {
  const cls = 'w-5 h-5';
  switch (kind) {
    case 'image': return <IconImage className={cls} strokeWidth={1.7} />;
    case 'audio': return <IconMusicNote className={cls} strokeWidth={1.7} />;
    case 'video': return <IconFilm className={cls} strokeWidth={1.7} />;
    case 'doc': return <IconDocument className={cls} strokeWidth={1.7} />;
    default: return <IconFolder className={cls} strokeWidth={1.7} />;
  }
}

/* ---------------- 组件 ---------------- */

export function MediaUploader({
  accept,
  multiple = true,
  maxFiles = 10,
  maxSize,
  onSuccess,
  title,
  className = '',
}: MediaUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  /** 校验并加入队列 */
  const enqueue = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const incoming = multiple ? arr : arr.slice(0, 1);
      setItems((prev) => {
        const remaining = maxFiles - prev.filter((p) => p.status !== 'error').length;
        const toAdd = incoming.slice(0, Math.max(0, remaining)).map((file) => {
          const kind = fileKind(file);
          const item: UploadItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            name: file.name,
            size: file.size,
            kind,
            progress: 0,
            status: 'pending',
          };
          // 大小校验
          if (maxSize && file.size > maxSize) {
            item.status = 'error';
            item.error = `文件超过 ${formatSize(maxSize)} 上限`;
          }
          return item;
        });
        return [...prev, ...toAdd];
      });
      // 立即开始上传 pending 项
      setTimeout(() => {
        setItems((curr) => {
          curr.filter((it) => it.status === 'pending').forEach((it) => startUpload(it));
          return curr;
        });
      }, 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [multiple, maxFiles, maxSize, title, onSuccess]
  );

  /** 执行单个文件上传 */
  const startUpload = useCallback(
    (item: UploadItem) => {
      const fd = new FormData();
      fd.append('file', item.file);
      if (title) fd.append('title', title);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/media/upload`);
      const token = tokenStore.get();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      updateItem(item.id, { status: 'uploading', progress: 0, xhr });

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status === 201 || xhr.status === 200) {
            updateItem(item.id, { status: 'success', progress: 100, result: data });
            onSuccess?.(data as UploadResult, item.file);
          } else {
            updateItem(item.id, {
              status: 'error',
              error: data?.message || `上传失败(${xhr.status})`,
            });
          }
        } catch {
          updateItem(item.id, { status: 'error', error: `上传失败(${xhr.status})` });
        }
      };

      xhr.onerror = () => updateItem(item.id, { status: 'error', error: '网络错误,上传失败' });
      xhr.onabort = () => updateItem(item.id, { status: 'error', error: '已取消上传' });

      xhr.send(fd);
    },
    [title, onSuccess, updateItem]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.xhr && target.status === 'uploading') target.xhr.abort();
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const retryItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((it) => it.id === id);
        if (!target) return prev;
        const fresh: UploadItem = { ...target, status: 'pending', progress: 0, error: undefined, result: undefined };
        setTimeout(() => startUpload(fresh), 0);
        return prev.map((it) => (it.id === id ? fresh : it));
      });
    },
    [startUpload]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files);
  }

  const successCount = items.filter((i) => i.status === 'success').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className={className}>
      {/* 拖拽 / 选择区域 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
          dragging
            ? 'border-primary-500 bg-primary-50 scale-[1.01]'
            : 'border-ink-200 hover:border-primary-300 hover:bg-primary-50/40'
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) enqueue(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex items-center justify-center mb-3">
          <IconUpload className="w-10 h-10 text-primary-500" strokeWidth={1.5} />
        </div>
        <div className="font-medium text-ink-800">点击选择或拖拽文件到此处</div>
        <div className="text-sm text-ink-400 mt-1">
          支持图片、音乐、视频、文档{multiple ? `(最多 ${maxFiles} 个)` : ''}
          {maxSize ? `,单文件 ≤ ${formatSize(maxSize)}` : ''}
        </div>
      </div>

      {/* 上传列表 */}
      {items.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`glass rounded-xl p-3.5 border transition-colors ${
                item.status === 'error'
                  ? 'border-rose-200 bg-rose-50/60'
                  : item.status === 'success'
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-ink-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ink-100 flex items-center justify-center text-lg flex-shrink-0">
                  {kindIcon(item.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900 truncate">{item.name}</span>
                    <span className="text-xs text-ink-400 flex-shrink-0">{formatSize(item.size)}</span>
                  </div>
                  {item.status === 'uploading' || item.status === 'pending' ? (
                    <div
                      className="mt-2"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.progress}
                      aria-label={`${item.name} 上传进度`}
                    >
                      <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all duration-200"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <div className="text-xs text-ink-500 mt-1">上传中… {item.progress}%</div>
                    </div>
                  ) : null}
                  {item.status === 'success' && item.result ? (
                    <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                      <span>
                        上传成功 · {item.result.kindLabel}
                        {item.result.reviewStatus === 'pending' ? ' · 待审核' : ''}
                      </span>
                      {item.result.url ? (
                        <Link
                          href={item.result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700 ml-1 underline"
                        >
                          查看
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  {item.status === 'error' ? (
                    <div className="text-xs text-rose-600 mt-1 flex items-center gap-1.5">
                      <IconClose className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                      <span>{item.error || '上传失败'}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.status === 'error' ? (
                    <button
                      onClick={() => retryItem(item.id)}
                      className="text-xs px-2 py-1 rounded-lg bg-ink-100 hover:bg-ink-200 text-ink-700 transition-colors"
                    >
                      重试
                    </button>
                  ) : null}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-ink-400 hover:text-rose-600 text-sm w-6 h-6 flex items-center justify-center rounded-lg hover:bg-ink-100 transition-colors"
                    aria-label="移除"
                  >
                    <IconClose className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 汇总信息 */}
          {(successCount > 0 || errorCount > 0) && (
            <div className="flex items-center gap-3 text-xs pt-1">
              {successCount > 0 ? (
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <IconCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                  {successCount} 个成功
                </span>
              ) : null}
              {errorCount > 0 ? (
                <span className="text-rose-600 inline-flex items-center gap-1">
                  <IconClose className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                  {errorCount} 个失败
                </span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default MediaUploader;
