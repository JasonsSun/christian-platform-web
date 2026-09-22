'use client';

import { useState, useEffect, useRef, useId } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiDelete, apiGet, apiPost, apiPatch } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { formatDateTime, countdown } from '@/lib/format';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import type { ActivityItem } from '@/lib/types';
import ShareButton from '@/components/ShareButton';
import Portal from '@/components/Portal';
import { Glyph, IconBan } from '@/components/icons';
import { activityCategoryLabel } from '@/lib/labels';
import dynamic from 'next/dynamic';

// 地图依赖 Leaflet(CDN) 且只在详情页可见时渲染，按需加载避免拖慢首屏
const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false }) as unknown as typeof import('@/components/LocationMap').default;
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Participant {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  city: string;
  status: string;
  joinedAt: string;
}

type Detail = ActivityItem & { participants: Participant[]; checkinCount: number; checkedIn: boolean; lat?: number | null; lng?: number | null };

function Avatar({ name, color, size = 40, userId }: { name: string; color: string; size?: number; userId?: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      data-user-id={userId}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const notice = useNotice();

  const { data, loading, error, reload } = useApi<Detail>(`/activities/${id}`, [id]);
  const { convert } = useI18n();
  const { run, pending, error: actionError } = useAction();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const autoFired = useRef(false);
  const qrAction = useAction();
  const [editLocOpen, setEditLocOpen] = useState(false);
  const [editLat, setEditLat] = useState<number | null>(null);
  const [editLng, setEditLng] = useState<number | null>(null);
  const [geoQuery, setGeoQuery] = useState('');
  const [geoMsg, setGeoMsg] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [savingLoc, setSavingLoc] = useState(false);

  // Esc 退出弹层，判据与遮罩点击一致：请求进行中不许关
  useEscape(cancelOpen || qrOpen, () => {
    if (qrOpen) {
      if (!qrAction.pending) setQrOpen(false);
    } else if (!busy) {
      setCancelOpen(false);
    }
  });
  // 焦点管理要写在下面的 loading/!data 早返回之前，否则 hook 数量会随渲染变化
  const cancelRef = useDialogFocus(cancelOpen);
  const cancelTitleId = useId();
  const qrRef = useDialogFocus(qrOpen);
  const qrTitleId = useId();

  async function locateByAddress() {
    const q = geoQuery.trim() || `${a.city} ${a.location}`.trim();
    if (!q) { setGeoMsg('请填写要定位的地址'); return; }
    setGeocoding(true);
    setGeoMsg('');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await r.json();
      if (Array.isArray(data) && data[0]?.lat) {
        setEditLat(Number(data[0].lat));
        setEditLng(Number(data[0].lon));
        setGeoMsg('已定位，可在地图上点选微调');
      } else {
        setGeoMsg('未找到该地址，请在地图上手动点选');
      }
    } catch {
      setGeoMsg('定位服务暂不可用，请在地图上手动点选');
    } finally {
      setGeocoding(false);
    }
  }

  async function saveLocation() {
    if (editLat == null || editLng == null) { setGeoMsg('请先在地图上选点'); return; }
    setSavingLoc(true);
    try {
      const res = await apiPatch<{ updated: boolean }>(`/activities/${id}`, { lat: editLat, lng: editLng });
      if (res?.updated) {
        notice.success('地点坐标已更新');
        setEditLocOpen(false);
        reload();
      }
    } finally {
      setSavingLoc(false);
    }
  }

  async function handleRegister() {
    if (!user) { router.push('/login'); return; }
    setBusy(true);
    await run(async () => {
      return apiPost<{ status: string; confirmedCount: number; waitlistCount: number }>(
        `/activities/${id}/register`
      );
    });
    await reload();
    setBusy(false);
  }

  async function handleCancel() {
    setBusy(true);
    await run(async () => {
      await apiDelete(`/activities/${id}/register`);
      return true;
    });
    await reload();
    setBusy(false);
  }

  const [checkinMsg, setCheckinMsg] = useState('');
  const [checkinError, setCheckinError] = useState('');

  /**
   * 取消活动（创建人 / 管理员）。
   * 取消不需要参与人同意，但后端会给全部参与人发通知。
   */
  async function handleCancelActivity() {
    setBusy(true);
    const res = await run(async () =>
      apiPost<{ notified: number; alreadyCancelled: boolean }>(`/activities/${id}/cancel`, {
        reason: cancelReason.trim(),
      })
    );
    setBusy(false);
    if (res) {
      setCancelOpen(false);
      setCancelReason('');
      notice.success(
        res.alreadyCancelled ? '该活动此前已被取消' : `活动已取消${res.notified ? `，已通知 ${res.notified} 位参与人` : ''}`
      );
      await reload();
    }
  }

  async function handleCheckin() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!data?.registered) {
      setCheckinError('请先报名');
      return;
    }
    setCheckinError('');
    setCheckinMsg('');
    const res = await run(async () =>
      apiPost<{ checkedIn: boolean; already: boolean; count: number }>(`/activities/${id}/checkin`)
    );
    if (res) {
      if (res.already) setCheckinMsg('您已签到');
      else setCheckinMsg('签到成功');
      reload();
    }
  }

  // 扫码签到：成员用手机扫签到码打开 ?checkin=1 时，登录且已报名则自动签到。
  // 注意：useEffect 必须写在任何条件 return 之前，否则 hook 数量随渲染变化 → React #310。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('checkin') !== '1') return;
    if (!user || !data) return;
    if (data.registered && !data.checkedIn && !autoFired.current) {
      autoFired.current = true;
      handleCheckin();
    } else if (!data.registered) {
      setCheckinError('请先报名后再扫码签到');
    }
  }, [user, data]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-3xl h-96 animate-pulse border border-ink-100" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <p className="text-rose-600 mb-4">{error}</p>
        <button onClick={reload} className="btn-secondary">重试</button>
      </div>
    );
  }

  if (!data) return null;

  const a = data;
  const isCancelled = a.status === 'cancelled';
  const canCancelActivity = !!user && (a.organizer.id === user.id || user.role === 'admin') && !isCancelled;
  const canEditActivity = !!user && (a.organizer.id === user.id || user.role === 'admin');

  const openQr = async () => {
    const res = await qrAction.run(() =>
      apiGet<{ qr: string; url: string }>(`/activities/${id}/checkin-qr`)
    );
    if (res) {
      setQrData(res.qr);
      setQrUrl(res.url);
      setQrOpen(true);
    }
  };

  const percent = a.capacity > 0 ? Math.min(100, Math.round((a.confirmedCount / a.capacity) * 100)) : 0;
  const ended = a.endAt ? new Date(a.endAt).getTime() < Date.now() : new Date(a.startAt).getTime() < Date.now();
  const confirmed = a.participants.filter((p) => p.status === 'confirmed');
  const waitlist = a.participants.filter((p) => p.status === 'waitlist');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isCancelled && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 flex items-start gap-3">
          <IconBan className="w-5 h-5 text-ink-500" strokeWidth={1.7} />
          <div>
            <p className="font-semibold text-rose-700 text-sm">此活动已取消</p>
            <p className="text-xs text-rose-700 mt-1">
              活动组织者或平台管理员已取消该活动，参与人已收到通知，无需前往。
            </p>
          </div>
        </div>
      )}
      {/* 封面 */}
      <div className="relative h-56 sm:h-72 rounded-3xl overflow-hidden bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center">
        {a.cover && !a.cover.startsWith('http') && a.cover.length <= 4 && (
          <Glyph glyph={a.cover} className="w-20 h-20 text-white/85" strokeWidth={1.2} />
        )}
        {a.cover && a.cover.startsWith('http') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={a.cover} alt={a.title} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-5 left-6 right-6">
          <span className="px-3 py-1 rounded-full chip-frost text-xs font-semibold mr-2">{activityCategoryLabel(a.category)}</span>
          {a.registered && (
            <span className="px-3 py-1 rounded-full bg-gold-400 text-ink-950 text-xs font-semibold">
              {a.myStatus === 'waitlist' ? '候补中' : '已报名'}
            </span>
          )}
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mt-3 drop-shadow-lg">{convert(a.title)}</h1>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-6">
        <div className="md:col-span-2 space-y-6">
          {/* 信息卡 */}
          <div className="glass rounded-2xl p-6 shadow-card space-y-4">
            <div className="flex items-center gap-3 text-ink-700">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <div className="font-semibold">{formatDateTime(a.startAt)}</div>
                {!ended && <div className="text-xs text-primary-600 font-semibold">{countdown(a.startAt)}</div>}
              </div>
            </div>
            <div className="flex items-center gap-3 text-ink-700">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 6 0 016 0z" /></svg>
              </div>
              <div><div className="font-semibold">{convert(a.city)} · {convert(a.location)}</div></div>
            </div>
            <Link href={`/users/${a.organizer.id}`} className="flex items-center gap-3 text-ink-700 hover:text-primary-600 transition-colors">
              <Avatar name={a.organizer.displayName} color={a.organizer.avatarColor} size={40} userId={a.organizer.id} />
              <div>
                <div className="font-semibold">{a.organizer.displayName}</div>
                <div className="text-xs text-ink-500">组织者</div>
              </div>
            </Link>
          </div>

          {/* 活动地点 + 地图 */}
          <div className="glass rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold text-ink-900">活动地点</h2>
              {canEditActivity && (
                <button
                  onClick={() => {
                    setEditLat(a.lat);
                    setEditLng(a.lng);
                    setGeoQuery('');
                    setGeoMsg('');
                    setEditLocOpen((v) => !v);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition"
                >
                  {a.lat != null && a.lng != null ? '重新标注' : '标注地点'}
                </button>
              )}
            </div>

            {editLocOpen ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label="活动地点地址"
                    value={geoQuery}
                    onChange={(e) => setGeoQuery(e.target.value)}
                    placeholder={`地址，如 ${a.city} ${a.location}`}
                    className="input-styled flex-1"
                  />
                  <button
                    onClick={locateByAddress}
                    disabled={geocoding}
                    className="text-xs px-3 py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition disabled:opacity-60"
                  >
                    {geocoding ? '定位中…' : '定位'}
                  </button>
                </div>
                {geoMsg && <p className="text-xs text-ink-500">{geoMsg}</p>}
                {editLat != null && editLng != null ? (
                  <LocationMap
                    lat={editLat}
                    lng={editLng}
                    title={convert(a.location) || a.title}
                    height={240}
                    interactive
                    onPick={({ lat, lng }) => { setEditLat(lat); setEditLng(lng); }}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
                    在地图上点选，或填写地址后点「定位」
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditLocOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveLocation}
                    disabled={savingLoc || editLat == null || editLng == null}
                    className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-50"
                  >
                    {savingLoc ? '保存中…' : '保存坐标'}
                  </button>
                </div>
              </div>
            ) : a.lat != null && a.lng != null ? (
              <div className="space-y-3">
                <LocationMap lat={a.lat} lng={a.lng} title={convert(a.location) || a.title} height={260} />
                <p className="text-sm text-ink-600">
                  <span className="font-semibold">{convert(a.city)}</span>
                  {a.location ? ` · ${convert(a.location)}` : ''}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=16/${a.lat}/${a.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                >
                  在 OpenStreetMap 中查看 ↗
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-600">
                  <span className="font-semibold">{convert(a.city)}</span>
                  {a.location ? ` · ${convert(a.location)}` : ''}
                </p>
                {a.city || a.location ? (
                  <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${a.city} ${a.location}`.trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                  >
                    在地图中查看位置 ↗
                  </a>
                ) : (
                  <p className="text-xs text-ink-400">组织者尚未标注具体坐标</p>
                )}
              </div>
            )}
          </div>

          {/* 介绍 */}
          <div className="glass rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-xl font-bold text-ink-900">活动介绍</h2>
              <ShareButton
                title={`活动 · ${a.title}`}
                text={`推荐给你一个圣约社区活动「${a.title}」，欢迎一起来参加。`}
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              />
            </div>
            <p className="text-ink-600 whitespace-pre-wrap leading-relaxed">{convert(a.description)}</p>
          </div>

          {/* 参与者 */}
          <div className="glass rounded-2xl p-6 shadow-card">
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">参与者 ({confirmed.length + waitlist.length})</h2>
            {a.participants.length === 0 && <p className="text-ink-500 text-sm">{convert('还没有人报名，快来成为第一个吧！')}</p>}
            {confirmed.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-ink-700 mb-2">已确认 ({confirmed.length})</h3>
                <div className="space-y-2">
                  {confirmed.map((p) => (
                    <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-primary-50 transition-colors">
                      <Avatar name={p.displayName} color={p.avatarColor} size={36} userId={p.id} />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-800 truncate">{p.displayName}</div>
                        <div className="text-xs text-ink-500">{p.city || '—'}</div>
                      </div>
                      <span className="ml-auto text-xs text-ink-400">{formatDateTime(p.joinedAt)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {waitlist.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gold-700 mb-2">候补 ({waitlist.length})</h3>
                <div className="space-y-2">
                  {waitlist.map((p) => (
                    <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-primary-50 transition-colors">
                      <Avatar name={p.displayName} color={p.avatarColor} size={36} userId={p.id} />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-800 truncate">{p.displayName}</div>
                        <div className="text-xs text-ink-500">{p.city || '—'}</div>
                      </div>
                      <span className="ml-auto text-xs text-gold-600">候补</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 侧栏：报名 */}
        <div className="md:col-span-1">
          <div className="glass rounded-2xl p-6 shadow-card md:sticky md:top-24 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-ink-500">报名进度</span>
                <span className="font-semibold text-primary-600">{a.confirmedCount}/{a.capacity}</span>
              </div>
              <div
                className="h-2.5 rounded-full bg-ink-100 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                aria-label="报名进度"
              >
                <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400" style={{ width: `${percent}%` }} />
              </div>
              {a.waitlistCount > 0 && <p className="text-xs text-gold-600 mt-2">另有 {a.waitlistCount} 人候补</p>}
            </div>

            {actionError && <p className="text-sm text-rose-600">{actionError}</p>}

            {isCancelled ? (
              <button disabled className="btn-secondary w-full opacity-60 cursor-not-allowed">活动已取消</button>
            ) : !user ? (
              <button onClick={() => router.push('/login')} className="btn-primary w-full">登录后报名</button>
            ) : a.organizer.id === user.id ? (
              // 创建人默认就是第一参与人，无需报名；创建后即自动写入报名记录
              <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-primary-700">你是本活动创建人</p>
                <p className="text-xs text-primary-700 mt-1">已自动加入参与者，无需报名</p>
              </div>
            ) : a.registered ? (
              <button onClick={handleCancel} disabled={busy || pending} className="btn-secondary w-full disabled:opacity-70">
                {busy ? '处理中…' : '取消报名'}
              </button>
            ) : ended ? (
              <button disabled className="btn-secondary w-full opacity-60 cursor-not-allowed">活动已结束</button>
            ) : (
              <button onClick={handleRegister} disabled={busy || pending} className="btn-primary w-full disabled:opacity-70">
                {busy ? '处理中…' : '立即报名'}
              </button>
            )}

            {a.registered && a.myStatus === 'waitlist' && (
              <p className="text-xs text-gold-600 text-center">名额已满，您当前在候补名单中，有人取消将自动转正。</p>
            )}

            {/* 取消活动：仅创建人与管理员可见 */}
            {canCancelActivity && (
              <button
                onClick={() => setCancelOpen(true)}
                disabled={busy || pending}
                className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 text-sm font-semibold hover:bg-rose-50 transition disabled:opacity-50"
              >
                取消活动
              </button>
            )}

            {/* 签到 */}
            <div className="divider-gradient" />
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500">已签到</span>
                <span className="font-semibold text-primary-600">{a.checkinCount} 人</span>
              </div>
              {checkinError && <p className="text-xs text-rose-600">{checkinError}</p>}
              {checkinMsg && <p className="text-xs text-emerald-600">{checkinMsg}</p>}
              {actionError && <p className="text-sm text-rose-600">{actionError}</p>}
              {!user ? (
                <button onClick={() => router.push('/login')} className="btn-secondary w-full">登录后签到</button>
              ) : !a.registered ? (
                <button onClick={handleCheckin} className="btn-secondary w-full opacity-80">签到（需先报名）</button>
              ) : (
                <button
                  onClick={handleCheckin}
                  disabled={busy || pending || a.checkedIn}
                  className={`w-full ${a.checkedIn ? 'btn-gold' : 'btn-primary'} disabled:opacity-70`}
                >
                  {busy || pending ? '处理中…' : a.checkedIn ? '已签到 ✓' : '签到'}
                </button>
              )}
              {canCancelActivity && (
                <button
                  onClick={openQr}
                  disabled={qrAction.pending}
                  className="w-full mt-2 py-2.5 rounded-xl border border-primary-200 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition disabled:opacity-50"
                >
                  {qrAction.pending ? '生成中…' : '生成签到二维码'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 取消活动：二次确认，无需参与人同意，但会通知全部参与人 */}
      {cancelOpen && (
        <Portal>
          <div
            ref={cancelRef}
            data-guard="activity-cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={cancelTitleId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(17,24,39,0.45)' }}
            onClick={() => !busy && setCancelOpen(false)}
          >
            <div className="bg-white rounded-2xl shadow-card-hover max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 id={cancelTitleId} className="font-display text-xl font-bold text-ink-900 mb-1">取消活动</h3>
              <p className="text-sm text-ink-500 mb-3">
                确定要取消「{a.title}」吗？取消后活动将标记为已取消，
                <span className="text-rose-700 font-semibold">
                  系统会立即通知全部 {confirmed.length + waitlist.length} 位参与人
                </span>
                ，无需他们同意。
              </p>
              <label htmlFor="cancel-reason-input" className="block text-xs text-ink-500 mb-1.5">取消原因（选填，会一并发给参与人）</label>
              <textarea
                id="cancel-reason-input"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                maxLength={120}
                placeholder="如：场地临时变更，改期另行通知"
                className="input-styled w-full resize-none mb-4"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition"
                >
                  再想想
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelActivity}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition disabled:opacity-50"
                >
                  {busy ? '处理中…' : '确认取消活动'}
                </button>
              </div>
              {actionError ? <p className="text-rose-600 text-xs mt-2 text-center">{actionError}</p> : null}
            </div>
          </div>
        </Portal>
      )}

      {/* 签到二维码 */}
      {qrOpen && (
        <Portal>
          <div
            ref={qrRef}
            data-guard="activity-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={qrTitleId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(17,24,39,0.45)' }}
            onClick={() => !qrAction.pending && setQrOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-card-hover max-w-sm w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id={qrTitleId} className="font-display text-lg font-bold text-ink-900 mb-3">签到二维码</h3>
              {qrData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrData} alt="签到二维码" className="mx-auto w-60 h-60 rounded-xl"  decoding="async"  loading="eager" />
              ) : (
                <div className="mx-auto w-60 h-60 rounded-xl bg-ink-100 flex items-center justify-center text-ink-600 text-sm">
                  生成中…
                </div>
              )}
              <p className="text-xs text-ink-500 mt-3 leading-relaxed">
                让成员用手机扫码打开活动页，登录且已报名即可
                <span className="text-primary-600 font-semibold">自动签到</span>。
              </p>
              <p className="text-[11px] text-ink-400 mt-2 break-all">{qrUrl}</p>
              <button
                onClick={() => setQrOpen(false)}
                className="mt-4 w-full py-2.5 rounded-xl border border-ink-200 text-ink-600 text-sm hover:bg-ink-50 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
