'use client';

import { useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { API_BASE, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatSize, formatDuration } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import QuotaCard, { QuotaData } from '@/components/QuotaCard';
import { IconCheck, IconDocument, IconFilm, IconImage, IconLock, IconMusicNote } from '@/components/icons';

const KINDS = [
  { key: 'image', label: '图片', accept: '.jpg,.jpeg,.png,.webp,.gif', icon: IconImage },
  { key: 'audio', label: '音乐', accept: '.mp3,.wav,.m4a,.aac,.ogg,.flac', icon: IconMusicNote },
  { key: 'video', label: '视频', accept: '.mp4,.mov,.webm,.mkv,.avi', icon: IconFilm },
  { key: 'doc', label: '资料', accept: '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.xls,.xlsx', icon: IconDocument },
];

interface Result {
  id: string; url: string; kind: string; kindLabel: string; title: string; fileName: string;
  sizeBytes: number; reviewStatus: string; durationSec?: number | null;
  tasks: { type: string; status: string }[];
  quota?: any;
}

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const [kind, setKind] = useState('image');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quota, reload: reloadQuota } = useApi<QuotaData>(user ? '/me/quota' : null, [user?.id]);

  const limits = useMemo(() => {
    const q = quota?.limits;
    return {
      image: q?.image ?? 8 * 1024 * 1024,
      audio: q?.audio ?? 50 * 1024 * 1024,
      video: q?.video ?? 200 * 1024 * 1024,
      doc: q?.doc ?? 30 * 1024 * 1024,
    } as Record<string, number>;
  }, [quota]);

  const active = KINDS.find((k) => k.key === kind)!;
  const limitBytes = limits[kind] || 0;

  const hint = useMemo(() => {
    if (!quota) return '加载配额中…';
    if (kind === 'video') return `≤ ${quota.policy.maxVideoMb}MB，时长 ≤ ${formatDuration(quota.policy.maxVideoSeconds)}`;
    if (kind === 'audio') return `≤ ${quota.policy.maxAudioMb}MB，时长 ≤ ${formatDuration(quota.policy.maxAudioSeconds)}`;
    if (kind === 'image') return `≤ ${quota.policy.maxImageMb}MB,JPG/PNG/WEBP/GIF`;
    return `≤ ${quota.policy.maxDocMb}MB,PDF/Word/PPT/Excel/TXT`;
  }, [kind, quota]);

  function pick(f: File | null) {
    setError(''); setResult(null);
    if (!f) { setFile(null); return; }
    if (limitBytes && f.size > limitBytes) {
      setError(`文件 ${formatSize(f.size)} 超过你当前等级的单文件上限 ${formatSize(limitBytes)}，请压缩后再上传或先提升等级`);
      setFile(null);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  }

  function submit() {
    if (!file) { setError('请先选择文件'); return; }
    if (quota && quota.usage.todayCount >= quota.policy.dailyUploads) {
      setError(`今日上传次数已用完（${quota.policy.dailyUploads} 个），明天再来或提升等级`);
      return;
    }
    setBusy(true); setError(''); setResult(null); setProgress(0);
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/media/upload`);
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status === 201) { setResult(j); setFile(null); setProgress(100); reloadQuota(); }
        else setError(j?.message || `上传失败(${xhr.status})`);
      } catch { setError(`上传失败(${xhr.status})`); }
    };
    xhr.onerror = () => { setBusy(false); setError('网络错误，上传失败'); };
    xhr.send(fd);
  }

  if (authLoading) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-ink-400">加载中…</div>;
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center mx-auto mb-4">
          <IconLock className="w-8 h-8 text-ink-500" strokeWidth={1.6} />
        </div>
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后即可上传图片、音乐、视频与资料</p>
        <Link href="/login?next=/upload" className="btn-primary">去登录</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-3xl font-bold text-ink-900">上传文件</h1>
      <p className="text-ink-500 mt-1 text-sm mb-5">上传后的文件需经管理员审核，通过后才会在「媒体与资料」公开展示</p>

      {quota ? <QuotaCard data={quota} /> : (
        <div className="glass rounded-2xl p-5 mb-5 text-sm text-ink-400">正在计算你的上传额度…</div>
      )}

      <div className="flex flex-wrap gap-2 mb-5 mt-5">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => { setKind(k.key); setFile(null); setResult(null); setError(''); }}
            aria-pressed={kind === k.key}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              kind === k.key ? 'bg-primary-600 text-white shadow-card' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <k.icon className="w-4 h-4" strokeWidth={1.8} />
              {k.label}
            </span>
          </button>
        ))}
      </div>

      <div className="glass rounded-2xl p-6 shadow-soft">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          // 真正的 input[type=file] 是 display:none，永远拿不到焦点，
          // 所以键盘用户能落脚的只有这个区域本身
          role="button"
          tabIndex={0}
          aria-label={`选择${active.label}文件`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragging ? 'border-primary-500 bg-primary-50' : 'border-ink-200 hover:border-primary-300 hover:bg-primary-50/40'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={active.accept}
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] || null)}
          />
          <div className="flex items-center justify-center mb-3">
            <active.icon className="w-10 h-10 text-primary-500" strokeWidth={1.5} />
          </div>
          {file ? (
            <>
              <div className="font-medium text-ink-900">{file.name}</div>
              <div className="text-sm text-ink-500 mt-1">
                {formatSize(file.size)} / 上限 {formatSize(limitBytes)}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-ink-800">点击选择或拖拽{active.label}到此处</div>
              <div className="text-sm text-ink-400 mt-1">{hint}</div>
            </>
          )}
        </div>

        <div className="mt-5">
          <label htmlFor="upload-title" className="block text-sm font-medium text-ink-700 mb-1.5">标题（可选）</label>
          <input id="upload-title" className="input-styled w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：主日敬拜现场录音" />
        </div>

        {busy ? (
          <div className="mt-5">
            <div
              className="h-2 rounded-full bg-ink-100 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="上传进度"
            >
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-ink-500 mt-1">上传中… {progress}%</div>
          </div>
        ) : null}

        {error ? <div role="alert" className="mt-4 text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-2">{error}</div> : null}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={submit} disabled={busy || !file} className="btn-primary disabled:opacity-50">
            {busy ? '上传中…' : '开始上传'}
          </button>
          {file ? <button onClick={() => { setFile(null); setProgress(0); }} className="text-sm text-ink-500 hover:text-ink-700">清空</button> : null}
        </div>
      </div>

      {result ? (
        <div className="mt-6 glass rounded-2xl p-6 shadow-soft border border-emerald-100">
          <div className="flex items-center gap-2 mb-3">
            <IconCheck className="w-6 h-6 text-emerald-600" strokeWidth={2} />
            <span className="font-medium text-ink-900">上传成功，已进入审核队列</span>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-gold-100 text-gold-800 text-xs">待审核</span>
          </div>
          <div className="text-sm text-ink-600">
            <div>
              {result.title || result.fileName}（{result.kindLabel},{formatSize(result.sizeBytes)}
              {result.durationSec ? `,${formatDuration(result.durationSec)}` : ''}）
            </div>
            <div className="text-xs text-ink-400 mt-1">处理任务:{result.tasks.map((t) => t.type).join('、') || '无'}</div>
            {result.quota?.next ? (
              <div className="text-xs text-gold-700 mt-2">
                再得 {result.quota.next.gap} 信任分升级「{result.quota.next.name}」:{result.quota.next.gains}
              </div>
            ) : null}
          </div>
          <div className="flex gap-3 mt-4">
            <Link href="/media" className="btn-secondary">去媒体库</Link>
            <Link href="/me?tab=growth" className="btn-secondary">我的成长</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
