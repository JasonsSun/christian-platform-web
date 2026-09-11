'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPatch, apiPost, apiDelete, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { formatDate, formatSize, MEDIA_REVIEW_LABEL } from '@/lib/format';
import QuotaCard, { type QuotaData } from '@/components/QuotaCard';
import type { ContentItem, ActivityItem, GroupItem, SongItem, MediaItem } from '@/lib/types';

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

function Avatar({ name, color, size = 80 }: { name: string; color: string; size?: number }) {
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
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<'contents' | 'activities' | 'groups' | 'drafts' | 'favorites' | 'uploads' | 'growth' | 'bible' | 'contentFavs' | 'blocks'>('contents');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', city: '', church: '' });
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    const valid = ['contents', 'drafts', 'favorites', 'activities', 'groups', 'uploads', 'growth', 'bible', 'contentFavs', 'blocks'];
    if (t && valid.includes(t)) setTab(t as any);
  }, []);

  function startEdit() {
    if (!user) return;
    setForm({ displayName: user.displayName || '', bio: user.bio || '', city: user.city || '', church: user.church || '' });
    setEditing(true);
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
          <Avatar name={user.displayName} color={user.avatarColor} size={88} />
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
            { key: 'blocks', label: '黑名单' },
            { key: 'bible', label: '读经历史' },
            { key: 'drafts', label: '草稿' },
            { key: 'uploads', label: '媒体' },
            { key: 'growth', label: '成长与额度' },
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
        {tab === 'blocks' && <MyBlocks />}
        {tab === 'bible' && <MyBibleHistory />}
        {tab === 'uploads' && <MyUploads />}
        {tab === 'growth' && <MyGrowth />}
        {tab === 'activities' && <MyActivities />}
        {tab === 'groups' && <MyGroups />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/70 rounded-2xl p-3 text-center border border-ink-100 hover:border-primary-200 transition-colors">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.45)' }} onClick={onClose}>
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
  );
}

/** 注销账号弹层：密码确认 + 二次勾选，软删除 */
function DeleteAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const { run, pending } = useAction();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(17,24,39,0.55)' }} onClick={onClose}>
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
  );
}

function MyGrowth() {
  const { data, loading, reload } = useApi<any>('/me/quota?refresh=1', []);
  const { run, pending } = useAction();

  if (loading) return <div className="text-center py-12 text-ink-400">正在计算你的成长画像…</div>;
  if (!data) return <div className="text-center py-12 text-ink-400">暂无画像数据</div>;

  const p = data.profile || {};
  const hours = Math.floor((p.onlineSeconds || 0) / 3600);
  const minutes = Math.floor(((p.onlineSeconds || 0) % 3600) / 60);

  const metrics: { label: string; value: string }[] = [
    { label: '注册天数', value: `${p.accountAgeDays ?? 0} 天` },
    { label: '活跃天数', value: `${p.activeDays ?? 0} 天` },
    { label: '在线时长', value: hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟` },
    { label: '使用次数', value: `${p.actionCount ?? 0} 次` },
    { label: '访问次数', value: `${p.visitCount ?? 0} 次` },
    { label: '发布内容', value: `${p.approvedContentCount ?? 0}/${p.contentCount ?? 0} 篇` },
    { label: '上传媒体', value: `${p.mediaCount ?? 0} 个` },
    { label: '审核通过', value: `${p.approvedMediaCount ?? 0} 个` },
    { label: '审核驳回', value: `${p.rejectedMediaCount ?? 0} 个` },
    { label: '活动签到', value: `${p.checkinDays ?? 0} 次` },
    { label: '好友', value: `${p.friendCount ?? 0} 位` },
    { label: '评论', value: `${p.commentCount ?? 0} 条` },
    { label: '获赞', value: `${p.likeReceived ?? 0} 个` },
    { label: '违规', value: `${p.violationCount ?? 0} 次` },
    { label: '已用存储', value: formatSize(p.storageBytes || 0) },
    { label: '信任分', value: `${data.trustScore} / 100` },
  ];

  async function recompute() {
    await run(() => apiGet('/me/quota?refresh=1'));
    reload();
  }

  return (
    <div className="space-y-5">
      <QuotaCard data={data} />

      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink-900">我的画像指标</h3>
          <button onClick={recompute} disabled={pending} className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-60">
            {pending ? '计算中…' : '重新计算'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-white/70 border border-ink-100 px-3 py-2.5">
              <div className="text-sm font-semibold text-ink-900">{m.value}</div>
              <div className="text-xs text-ink-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-5 shadow-soft">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">如何提升上传额度</h3>
        <ul className="text-sm text-ink-600 space-y-2 list-disc pl-5">
          <li>保持在线：每累计 10 分钟 +1 分（上限 25 分）</li>
          <li>每天访问：每个活跃天 +2 分（上限 20 分）</li>
          <li>多互动：每 10 次点击/操作 +1 分（上限 15 分）</li>
          <li>发布内容：每篇已发布 +3 分（上限 15 分）</li>
          <li>上传通过审核的媒体：每个 +1 分（上限 10 分）</li>
          <li>活动签到、结交朋友、获得点赞也会累积少量分值</li>
          <li className="text-rose-600">内容被驳回 -2 分 / 次，被判定违规 -8 分 / 次</li>
        </ul>
        {data.next ? (
          <div className="mt-4 rounded-xl bg-gold-50 border border-gold-100 px-4 py-3 text-sm text-gold-800">
            再获得 <b>{data.next.gap}</b> 分即可升级为「{data.next.name}」：{data.next.gains}
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-gold-50 border border-gold-100 px-4 py-3 text-sm text-gold-800">
            你已是最高等级，享有全部上传权益。
          </div>
        )}
      </div>
    </div>
  );
}

function MyContents() {
  const { data, loading, error, reload } = useApi<{ items: ContentItem[] }>(`/contents${qs({ status: 'mine', pageSize: 30 })}`, []);
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有发布内容" action={{ label: '去发布', href: '/community/create' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => (
        <Link key={c.id} href={`/contents/${c.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
            <h3 className="font-semibold text-ink-900 truncate">{c.title}</h3>
          </div>
          <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body}</p>
          <div className="flex gap-3 mt-3 text-xs text-ink-400">
            <span>❤️ {c.likeCount}</span>
            <span>💬 {c.commentCount}</span>
            <span>{c.status === 'published' ? '已发布' : c.status === 'pending_review' ? '审核中' : c.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MyActivities() {
  const { data, loading, error, reload } = useApi<{ items: ActivityItem[] }>(`/activities${qs({ scope: 'all', pageSize: 50 })}`, []);
  const items = (data?.items || []).filter((a) => a.registered);
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有报名任何活动" action={{ label: '浏览活动', href: '/activities' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((a) => (
        <Link key={a.id} href={`/activities/${a.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl flex-shrink-0">
            {a.cover?.startsWith('http') ? '📅' : a.cover || '📅'}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 truncate">{a.title}</h3>
            <p className="text-xs text-ink-500 mt-1">{a.city} · {formatDate(a.startAt)}</p>
            <span className={`text-xs font-semibold mt-1 inline-block ${a.myStatus === 'waitlist' ? 'text-gold-600' : 'text-primary-600'}`}>
              {a.myStatus === 'waitlist' ? '候补中' : '已报名'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MyGroups() {
  const { data, loading, error, reload } = useApi<{ items: GroupItem[] }>(`/groups${qs({ scope: 'mine', pageSize: 30 })}`, []);
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有加入任何团契" action={{ label: '发现团契', href: '/groups' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((g) => (
        <Link key={g.id} href={`/groups/${g.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gold-500 to-gold-400 flex items-center justify-center text-2xl flex-shrink-0">
            {g.cover?.startsWith('http') ? '👥' : g.cover || '👥'}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 truncate">{g.name}</h3>
            <p className="text-xs text-ink-500 mt-1">{g.city} · {g.memberCount} 位成员</p>
            <p className="text-xs text-ink-500 truncate mt-1">{g.category}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MyDrafts() {
  const { data, loading, error, reload } = useApi<{ items: ContentItem[]; total: number }>(`/contents${qs({ status: 'draft', pageSize: 30 })}`, []);
  const items = data?.items || [];
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { run, error: submitError } = useAction();
  const notice = useNotice();

  const submit = useCallback(
    async (c: ContentItem) => {
      setSubmittingId(c.id);
      const res = await run(() => apiPost<{ ok: boolean }>(`/contents/${c.id}/submit`));
      setSubmittingId(null);
      if (res) {
        reload();
        notice.success('已提交，进入审核中');
      }
    },
    [run, reload, notice]
  );

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有草稿" action={{ label: '去创作', href: '/community/create' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => (
        <div key={c.id} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
            <h3 className="font-semibold text-ink-900 truncate">{c.title || '未命名草稿'}</h3>
          </div>
          <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body || '（暂无内容）'}</p>
          <div className="flex items-center justify-end gap-2 mt-3">
            <Link href={`/contents/${c.id}`} className="btn-secondary text-sm py-1.5 px-3">继续编辑</Link>
            <button
              onClick={() => submit(c)}
              disabled={submittingId === c.id}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-70"
            >
              {submittingId === c.id ? '提交中…' : '提交审核'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MyFavorites() {
  const { data, loading, error, reload } = useApi<{ items: SongItem[] }>(`/songs/favorites`, []);
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有收藏任何诗歌" action={{ label: '去发现诗歌', href: '/songs' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((s) => (
        <Link key={s.id} href={`/songs/${s.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-500 to-gold-400 flex items-center justify-center text-xl flex-shrink-0">🎵
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink-900 truncate">{s.title}</h3>
              <p className="text-xs text-ink-500 mt-0.5">{s.author || '佚名'} · {s.category || '诗歌'}</p>
            </div>
          </div>
          {s.tags && s.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {s.tags.slice(0, 3).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 text-xs">#{t}</span>
              ))}
            </div>
          )}
        </Link>
        ))}
      </div>
  );
}

function MyContentFavorites() {
  const { data, loading, error, reload } = useApi<{ items: ContentItem[] }>(`/me/favorites`, []);
  const items = data?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有收藏任何内容" action={{ label: '去发现内容', href: '/community' }} />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => (
        <Link key={c.id} href={`/contents/${c.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.cover?.startsWith('http') ? '📄' : c.cover || '📄'}</span>
            <h3 className="font-semibold text-ink-900 truncate">{c.title}</h3>
          </div>
          <p className="text-sm text-ink-500 line-clamp-2">{c.excerpt || c.body}</p>
          <div className="flex gap-3 mt-3 text-xs text-ink-400">
            <span>❤️ {c.likeCount}</span>
            <span>💬 {c.commentCount}</span>
            <span>{c.status === 'published' ? '已发布' : c.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MyBlocks() {
  const { data, loading, error, reload } = useApi<{ items: { id: string; displayName: string; username: string; avatarColor: string; city: string; church: string }[] }>('/me/blocks', []);
  const { run } = useAction();
  const notice = useNotice();

  async function unblock(id: string) {
    const res = await run(() => apiDelete<{ blocked: boolean }>(`/users/${id}/block`));
    if (res) {
      reload();
      notice.success('已解除屏蔽');
    }
  }

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  const items = data?.items || [];
  if (items.length === 0) return <EmptyBlock text="你还没有屏蔽任何人" action={{ label: '发现弟兄姐妹', href: '/friends' }} />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">屏蔽后，对方将不会出现在你的关注动态与私信会话中。</p>
      {items.map((u) => (
        <div key={u.id} className="bg-white rounded-2xl p-4 border border-ink-100 flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ background: u.avatarColor }}
          >
            {(u.displayName || u.username || '?').slice(0, 1)}
          </span>
          <div className="flex-1 min-w-0">
            <Link href={`/users/${u.id}`} className="font-semibold text-ink-900 hover:text-primary-600 transition-colors">{u.displayName}</Link>
            <p className="text-xs text-ink-400">@{u.username}{u.city ? ` · ${u.city}` : ''}</p>
          </div>
          <button onClick={() => unblock(u.id)} className="text-sm text-rose-500 hover:underline flex-shrink-0">解除屏蔽</button>
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-ink-100" />))}
    </div>
  );
}

function ErrorBlock({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="text-center py-12">
      <p className="text-rose-600 mb-3">{msg}</p>
      <button onClick={onRetry} className="btn-secondary">重试</button>
    </div>
  );
}

function EmptyBlock({ text, action }: { text: string; action: { label: string; href: string } }) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center text-2xl mx-auto mb-3">📭</div>
      <p className="text-ink-500 mb-4">{text}</p>
      <Link href={action.href} className="btn-primary">{action.label}</Link>
    </div>
  );
}

const REVIEW_TONE: Record<string, string> = {
  pending: 'bg-gold-100 text-gold-800',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

function MyUploads() {
  const { data, loading, error, reload } = useApi<{ items: MediaItem[]; total: number }>(`/media/mine?pageSize=48`, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const items = data?.items || [];

  async function remove(id: string) {
    setBusyId(id); setMsg('');
    try {
      await apiDelete(`/media/${id}`);
      setMsg('已移入回收站');
      reload();
    } catch (e: any) {
      setMsg(e?.message || '删除失败');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBlock msg={error} onRetry={reload} />;
  if (items.length === 0) return <EmptyBlock text="还没有上传任何文件" action={{ label: '去上传', href: '/upload' }} />;

  return (
    <div>
      {msg ? <div className="mb-4 text-sm text-primary-700 bg-primary-50 rounded-xl px-4 py-2">{msg}</div> : null}
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((m) => (
          <div key={m.id} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-ink-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {m.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">{m.kind === 'audio' ? '🎵' : m.kind === 'video' ? '🎬' : m.kind === 'score' ? '🎼' : '📄'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-ink-900 truncate">{m.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs ${REVIEW_TONE[m.reviewStatus] || 'bg-ink-100 text-ink-600'}`}>
                  {MEDIA_REVIEW_LABEL[m.reviewStatus] || m.reviewStatus}
                </span>
              </div>
              <div className="text-xs text-ink-400 mt-1">{m.kindLabel} · {formatSize(m.sizeBytes)} · {formatDate(m.createdAt)}</div>
              {m.reviewStatus === 'rejected' && m.reviewReason ? (
                <div className="text-xs text-rose-600 mt-1">驳回原因：{m.reviewReason}</div>
              ) : null}
              <div className="flex items-center gap-3 mt-2 text-sm">
                {m.reviewStatus === 'approved' ? <Link href="/media" className="text-primary-600 hover:underline">已在媒体库展示</Link> : null}
                <a href={m.url} download={m.fileName} className="text-ink-500 hover:text-ink-700">下载</a>
                <button onClick={() => remove(m.id)} disabled={busyId === m.id} className="text-rose-500 hover:underline disabled:opacity-50">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BibleHistoryItem {
  version: string;
  bookId: string;
  bookName: string;
  chapter: number;
  readDate: string;
  readAt: string;
}

function MyBibleHistory() {
  const { data, loading, error } = useApi<{ items: BibleHistoryItem[] }>('/bible/history');
  const items = data?.items || [];

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-ink-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-rose-600 text-sm">加载失败：{error}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-3">📖</div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-1">还没有读经记录</h3>
        <p className="text-ink-500 text-sm mb-4">开始你的第一段读经旅程吧</p>
        <Link href="/bible" className="btn-primary px-5 py-2.5 text-sm">去读经</Link>
      </div>
    );
  }

  // 按日期分组
  const grouped: Record<string, BibleHistoryItem[]> = {};
  for (const it of items) {
    if (!grouped[it.readDate]) grouped[it.readDate] = [];
    grouped[it.readDate].push(it);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, list]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-primary-600">{date}</span>
            <span className="text-xs text-ink-400">读了 {list.length} 章</span>
          </div>
          <div className="space-y-2">
            {list.map((it, i) => (
              <Link
                key={`${it.bookId}-${it.chapter}-${i}`}
                href={`/bible/${it.version}/${it.bookId}/${it.chapter}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-ink-100 hover:border-primary-300 hover:shadow-soft transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-semibold flex-shrink-0">
                  {it.bookName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-900 group-hover:text-primary-600 transition-colors">
                    {it.bookName} 第 {it.chapter} 章
                  </p>
                  <p className="text-xs text-ink-400">译本：{it.version.toUpperCase()} · {formatDate(it.readAt)}</p>
                </div>
                <svg className="w-4 h-4 text-ink-300 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
