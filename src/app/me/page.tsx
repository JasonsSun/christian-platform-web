'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPatch, apiPost, apiDelete, apiForm, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useConfirmNav } from '@/lib/confirm';
import Portal from '@/components/Portal';
import { useEscape } from '@/lib/a11y';
import { useNotice } from '@/lib/notice';
import { formatDate, formatSize, MEDIA_REVIEW_LABEL } from '@/lib/format';
import QuotaCard, { type QuotaData } from '@/components/QuotaCard';
import BackplaySettingCard from '@/components/BackplaySettingCard';
import CheckinHeatmap from '@/components/CheckinHeatmap';
import BadgeWall from '@/components/BadgeWall';
import type { ContentItem, ActivityItem, GroupItem, SongItem, MediaItem } from '@/lib/types';
import dynamic from 'next/dynamic';
import { SkeletonGrid, ErrorBlock, EmptyBlock } from './_panels/shared';
import { MyContents } from './_panels/MyContents';
import { MyActivities } from './_panels/MyActivities';
import { MyGroups } from './_panels/MyGroups';
import { MyDrafts } from './_panels/MyDrafts';
import { MyFavorites } from './_panels/MyFavorites';

/**
 * 个人中心 12 个 tab 的面板原先全写在同一个文件里(1498 行),首屏要为所有面板买单。
 * 低频面板已拆到 ./_panels/*(下划线开头,不会被 App Router 当成路由),这里按需加载:
 * 切到哪个 tab 才下载哪块。高频的「内容/草稿/收藏/活动/团契」仍留在首屏。
 */
const PanelLoading = () => <div className="text-center py-12 text-ink-400">正在加载…</div>;

const MyGrowth = dynamic(() => import('./_panels/Growth').then((m) => m.MyGrowth), { loading: () => <PanelLoading /> });
const MyContentFavorites = dynamic(() => import('./_panels/ContentFavs').then((m) => m.MyContentFavorites), { loading: () => <PanelLoading /> });
const MyFavCenter = dynamic(() => import('./_panels/FavCenter').then((m) => m.MyFavCenter), { loading: () => <PanelLoading /> });
const MyBlocks = dynamic(() => import('./_panels/Blocks').then((m) => m.MyBlocks), { loading: () => <PanelLoading /> });
const MyUploads = dynamic(() => import('./_panels/Uploads').then((m) => m.MyUploads), { loading: () => <PanelLoading /> });
const MyBibleHistory = dynamic(() => import('./_panels/BibleHistory').then((m) => m.MyBibleHistory), { loading: () => <PanelLoading /> });

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

function Avatar({ name, color, size = 80, avatarUrl }: { name: string; color: string; size?: number; avatarUrl?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function MePage() {
  const { user, loading: authLoading, logout, setUser } = useAuth();
  const notice = useNotice();
  const router = useRouter();

  const [tab, setTab] = useState<'contents' | 'activities' | 'groups' | 'drafts' | 'favorites' | 'uploads' | 'growth' | 'bible' | 'contentFavs' | 'blocks' | 'favcenter' | 'badges'>('contents');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', city: '', church: '' });
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    const valid = ['contents', 'drafts', 'favorites', 'activities', 'groups', 'uploads', 'growth', 'bible', 'contentFavs', 'blocks', 'favcenter', 'badges'];
    if (t && valid.includes(t)) setTab(t as any);
  }, []);

  function startEdit() {
    if (!user) return;
    setForm({ displayName: user.displayName || '', bio: user.bio || '', city: user.city || '', church: user.church || '' });
    setEditing(true);
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const r = await apiForm<{ avatarUrl: string; user: any }>('/me/avatar', form);
      if (r) {
        setUser(r.user);
        notice.success('头像已更新');
      }
    } catch (err: any) {
      notice.error(err?.message || '上传失败，请重试');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (authLoading) {
    return <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-ink-400">加载中…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-4">🔒</div>
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">请先登录</h2>
        <p className="text-ink-500 mb-6">登录后即可查看和管理你的个人中心</p>
        <button onClick={() => router.push('/login')} className="btn-primary">去登录</button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 资料卡 */}
      <div className="glass rounded-3xl p-6 sm:p-8 shadow-card">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative group">
            <Avatar name={user.displayName} color={user.avatarColor} size={88} avatarUrl={user.avatarUrl} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {uploading ? '上传中…' : '更换头像'}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadAvatar} />
          </div>
          <div className="flex-1 text-center sm:text-left">
            {!editing ? (
              <>
                <h1 className="font-display text-2xl font-bold text-ink-900">{user.displayName}</h1>
                <p className="text-ink-500 text-sm mt-1">@{user.username}</p>
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3 text-sm">
                  {user.city && <span className="px-3 py-1 rounded-full bg-primary-50 text-primary-600">📍 {user.city}</span>}
                  {user.church && <span className="px-3 py-1 rounded-full bg-gold-50 text-gold-700">⛪ {user.church}</span>}
                </div>
                {user.bio && <p className="text-ink-600 mt-3 whitespace-pre-wrap">{user.bio}</p>}
                <div className="flex gap-3 mt-4 justify-center sm:justify-start">
                  <button onClick={startEdit} className="btn-secondary">编辑资料</button>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary">
                    {uploading ? '上传中…' : '更换头像'}
                  </button>
                </div>
              </>
            ) : (
              <EditForm
                form={form}
                setForm={setForm}
                onCancel={() => setEditing(false)}
                onDone={() => setEditing(false)}
              />
            )}
          </div>
        </div>

        {/* 统计卡 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          <Stat label="内容" value={user.stats?.contents ?? 0} />
          <Stat label="粉丝" value={user.stats?.followers ?? 0} />
          <Stat label="关注" value={user.stats?.following ?? 0} />
          <Stat label="活动" value={user.stats?.activities ?? 0} />
          <Stat label="团契" value={user.stats?.groups ?? 0} />
        </div>
      </div>

      {/* 精简配额卡片 */}
      <QuotaCompact />

      {/* 后台播放偏好 */}
      <BackplaySettingCard />

      {/* 读经打卡热力图 + 成就 */}
      <CheckinHeatmap />

      {/* 成就徽章概览（紧凑） */}
      <BadgeWall compact onMore={() => setTab('badges')} />

      {/* 信仰生活：灵修日记 / 读经笔记 */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/devotions"
          className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft border border-ink-100 hover:border-primary-300 hover:shadow-card-hover transition-all"
        >
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 flex items-center justify-center text-xl flex-shrink-0 group-hover:from-primary-500 group-hover:to-primary-700 group-hover:text-white transition-colors">
            📖
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink-900 text-sm">灵修日记</span>
            <span className="block text-xs text-ink-500 mt-0.5 truncate">默想、祷告与感恩，仅自己可见</span>
          </span>
        </Link>
        <Link
          href="/bible/notes"
          className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft border border-ink-100 hover:border-gold-300 hover:shadow-card-hover transition-all"
        >
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 text-gold-700 flex items-center justify-center text-xl flex-shrink-0 group-hover:from-gold-400 group-hover:to-gold-600 group-hover:text-ink-950 transition-colors">
            ✎
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink-900 text-sm">读经笔记与高亮</span>
            <span className="block text-xs text-ink-500 mt-0.5 truncate">回看经文亮光，可导出 Markdown</span>
          </span>
        </Link>
      </div>

      {/* 账户与数据 */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/feed" className="px-5 py-2.5 rounded-xl text-primary-600 border border-primary-200 hover:bg-primary-50 text-sm font-medium transition-colors">关注动态</Link>
          <a href="/api/v1/me/export" download className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors">导出我的数据</a>
          <button
            onClick={() => setShowPwdModal(true)}
            className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors"
          >
            修改密码
          </button>
          <Link
            href="/settings/sessions"
            className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors"
          >
            登录设备
          </Link>
          <Link
            href="/settings/two-factor"
            className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors"
          >
            双因素认证
          </Link>
          <Link
            href="/settings/oauth"
            className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors"
          >
            第三方账号
          </Link>
          <Link
            href="/settings/privacy"
            className="px-5 py-2.5 rounded-xl text-ink-600 border border-ink-200 hover:bg-ink-50 text-sm font-medium transition-colors"
          >
            私信隐私
          </Link>
          <button
            onClick={async () => { await logout(); router.push('/'); }}
            className="px-5 py-2.5 rounded-xl text-rose-600 border border-rose-200 hover:bg-rose-50 text-sm font-medium transition-colors"
          >
            退出登录
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-5 py-2.5 rounded-xl text-ink-400 border border-ink-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-sm transition-colors"
          >
            注销账号
          </button>
        </div>
      </div>

      {/* 修改密码弹层 */}
      {showPwdModal && (
        <PasswordModal
          onClose={() => setShowPwdModal(false)}
          onDone={async () => {
            setShowPwdModal(false);
            await logout();
            router.push('/login');
          }}
        />
      )}

      {/* 注销账号弹层 */}
      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDone={async () => {
            setShowDeleteModal(false);
            await logout();
            router.push('/');
          }}
        />
      )}

      {/* Tab */}
      <div className="mt-8 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-1 border-b border-ink-200 min-w-max">
          {[
            { key: 'contents', label: '我的内容' },
            { key: 'activities', label: '我的活动' },
            { key: 'groups', label: '我的团契' },
            { key: 'favorites', label: '收藏诗歌' },
            { key: 'contentFavs', label: '收藏内容' },
            { key: 'favcenter', label: '收藏中心' },
            { key: 'blocks', label: '黑名单' },
            { key: 'bible', label: '读经历史' },
            { key: 'drafts', label: '草稿' },
            { key: 'uploads', label: '媒体' },
            { key: 'growth', label: '成长与额度' },
            { key: 'badges', label: '成就徽章' },
          ].map((t) => (
            <button
              key={t.key}
              data-tab={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === t.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === 'contents' && <MyContents />}
        {tab === 'drafts' && <MyDrafts />}
        {tab === 'favorites' && <MyFavorites />}
        {tab === 'contentFavs' && <MyContentFavorites />}
        {tab === 'favcenter' && <MyFavCenter />}
        {tab === 'blocks' && <MyBlocks />}
        {tab === 'bible' && <MyBibleHistory />}
        {tab === 'uploads' && <MyUploads />}
        {tab === 'growth' && <MyGrowth />}
        {tab === 'badges' && <BadgeWall />}
        {tab === 'activities' && <MyActivities />}
        {tab === 'groups' && <MyGroups />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ui-surface rounded-2xl p-3 text-center border border-ink-100 hover:border-primary-200 transition-colors">
      <div className="font-display text-2xl font-bold text-ink-900">{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}

function QuotaCompact() {
  const { data } = useApi<QuotaData>('/me/quota', []);
  if (!data) return null;
  const p = data.policy;
  const usedPct = p.totalBytes > 0 ? Math.min(100, Math.round((data.usage.totalBytes / p.totalBytes) * 100)) : 0;
  const barColor = usedPct > 85 ? 'bg-rose-500' : 'bg-primary-600';

  return (
    <div className="glass rounded-2xl p-5 shadow-soft mt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center text-white text-lg flex-shrink-0">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-ink-900">L{data.level} · {data.levelName}</span>
              <span className="text-xs text-ink-500">信任分 {data.trustScore}</span>
            </div>
            <div className="text-xs text-ink-400 mt-0.5">
              已用存储 {formatSize(data.usage.totalBytes)} / {formatSize(p.totalBytes)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-ink-900">{data.usage.todayCount}<span className="text-ink-400 text-xs">/{p.dailyUploads}</span></div>
            <div className="text-xs text-ink-500">今日上传</div>
          </div>
          <button
            onClick={() => {
              const el = document.querySelector('[data-tab="growth"]') as HTMLElement | null;
              el?.click();
            }}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
          >
            详情 →
          </button>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${usedPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function EditForm({ form, setForm, onCancel, onDone }: {
  form: { displayName: string; bio: string; city: string; church: string };
  setForm: (f: any) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { run, pending, error } = useAction();
  const { setUser } = useAuth();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() => apiPatch<{ user: any }>('/auth/me', form));
    if (res) {
      setUser(res.user);
      onDone();
    }
  }

  return (
    <form onSubmit={save} className="w-full space-y-3 text-left">
      <input className="input-styled" placeholder="昵称" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <input className="input-styled" placeholder="城市" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} list="cities" />
      <input className="input-styled" placeholder="教会" value={form.church} onChange={(e) => setForm({ ...form, church: e.target.value })} />
      <textarea className="input-styled min-h-[80px]" placeholder="个人简介" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">取消</button>
        <button type="submit" disabled={pending} className="btn-primary flex-1 disabled:opacity-70">{pending ? '保存中…' : '保存'}</button>
      </div>
    </form>
  );
}

/** 修改密码弹层：成功后吊销全部会话并引导重新登录 */
function PasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { run, pending } = useAction();
  const notice = useNotice();
  useEscape(true, onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('新密码至少 6 位'); return; }
    if (newPassword !== confirmPassword) { setError('两次输入的新密码不一致'); return; }
    const res = await run(() => apiPatch<{ updated: boolean }>('/auth/password', { oldPassword, newPassword }));
    if (res?.updated) {
      notice.success('密码已修改，请重新登录');
      onDone();
    } else {
      setError('修改失败，请稍后再试');
    }
  }

  return (
    <Portal>
    <div data-guard="pwd-modal" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-ink-900 mb-1">修改密码</h3>
        <p className="text-sm text-ink-500 mb-5">修改成功后需重新登录，其他设备将全部退出</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input-styled" type="password" placeholder="当前密码" value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" required
          />
          <input
            className="input-styled" type="password" placeholder="新密码（至少 6 位）" value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required
          />
          <input
            className="input-styled" type="password" placeholder="再次输入新密码" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" disabled={pending} className="btn-primary flex-1 disabled:opacity-70">{pending ? '提交中…' : '确认修改'}</button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

/** 注销账号弹层：密码确认 + 二次勾选，软删除 */
function DeleteAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const { run, pending } = useAction();
  useEscape(true, onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!confirmed) { setError('请先勾选确认注销后果'); return; }
    const res = await run(() => apiDelete<{ deleted: boolean }>('/auth/me/deactivate', { password }));
    if (res?.deleted) {
      onDone();
    } else {
      setError('注销失败，请稍后再试');
    }
  }

  return (
    <Portal>
    <div data-guard="delete-account-modal" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-rose-700 mb-1">注销账号</h3>
        <p className="text-sm text-ink-500 mb-4">此操作不可恢复，请谨慎操作</p>
        <ul className="text-sm text-ink-600 space-y-1.5 mb-4 pl-5 list-disc">
          <li>账号将立即退出登录，且无法再登录</li>
          <li>昵称、简介、城市、教会等个人信息将被清空</li>
          <li>已发布内容将全部下架（数据保留用于审计）</li>
          <li>点赞、评论、好友等社交关系保留但不再展示你的身份</li>
        </ul>
        <form onSubmit={submit} className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-ink-600 cursor-pointer">
            <input
              type="checkbox" checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-rose-600"
            />
            <span>我已了解注销的后果，确认注销本账号</span>
          </label>
          <input
            className="input-styled" type="password" placeholder="输入当前密码确认" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" disabled={pending || !password || !confirmed} className="flex-1 px-4 py-2 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors">
              {pending ? '注销中…' : '确认注销'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

/** 每日签到：连续天数 + 本月日历 + 等级进度 */


