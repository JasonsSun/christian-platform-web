'use client';

/**
 * 发布活动（独立页面）
 *
 * 原实现为 /activities 页面上的模态弹框。按「全站无弹框、操作一律走页面跳转」的规范，
 * 抽出为独立页面：发布成功后跳回活动详情页，取消则返回活动列表。
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import dynamic from 'next/dynamic';

// 地图组件依赖 Leaflet(CDN)，创建页只是选点时才用，按需加载
const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false }) as unknown as typeof import('@/components/LocationMap').default;

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

const CATEGORIES = [
  { value: 'fellowship', label: '团契' },
  { value: 'worship', label: '崇拜' },
  { value: 'retreat', label: '退修会' },
  { value: 'training', label: '培训' },
  { value: 'service', label: '服务' },
];

const COVERS = ['📅', '🙏', '📖', '🎶', '🌿', '✨', '🕊️', '❤️'];
// 按钮的名字只有 emoji，读屏念出来是「日历」「双手合十」这种噪音，也听不出当前选中的是哪一个
const COVER_NAME: Record<string, string> = {
  '📅': '日历', '🙏': '祷告', '📖': '圣经', '🎶': '诗歌',
  '🌿': '新芽', '✨': '星光', '🕊️': '和平鸽', '❤️': '爱心',
};

export default function NewActivityPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const notice = useNotice();
  const { run, pending, error } = useAction();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: CATEGORIES[0].value,
    location: '',
    city: CITIES[0],
    startAt: '',
    capacity: '50',
    cover: COVERS[0],
    lat: null as number | null,
    lng: null as number | null,
  });
  const [localError, setLocalError] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');

  /** 用地址反查坐标（Nominatim，best-effort，失败不影响发布） */
  async function locateByAddress() {
    const q = `${form.city} ${form.location}`.trim();
    if (!q) {
      setGeoMsg('请先填写城市与地点');
      return;
    }
    setGeocoding(true);
    setGeoMsg('');
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      );
      const data = await r.json();
      if (Array.isArray(data) && data[0]?.lat) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        setForm((f) => ({ ...f, lat, lng }));
        setGeoMsg('已定位到坐标，可拖动地图微调');
      } else {
        setGeoMsg('未能根据地址定位，请在地图上手动点选');
      }
    } catch {
      setGeoMsg('定位服务暂不可用，请在地图上手动点选');
    } finally {
      setGeocoding(false);
    }
  }

  useEffect(() => {
    if (!loading && !user) {
      notice.info('请先登录后再发布活动');
      router.replace('/login?next=' + encodeURIComponent('/activities/new'));
    }
  }, [loading, user, router, notice]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (!form.title.trim()) {
      setLocalError('请填写活动标题');
      return;
    }
    if (form.title.trim().length < 2) {
      setLocalError('活动标题至少 2 个字');
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 5) {
      setLocalError('请填写活动介绍（至少 5 个字）');
      return;
    }
    if (!form.startAt) {
      setLocalError('请选择活动开始时间');
      return;
    }
    const res = await run(() =>
      apiPost<{ id: string }>('/activities', {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        capacity: Number(form.capacity) || 50,
        startAt: new Date(form.startAt).toISOString(),
        lat: form.lat,
        lng: form.lng,
      })
    );
    if (res?.id) {
      notice.success('活动发布成功');
      router.replace(`/activities/${res.id}`);
    }
  }

  if (loading) {
    // 外层沿用正文同一个 root：React 会复用这一个 DOM 节点，若从 max-w-3xl 直接换成整屏宽，
    // 节点会整体左移 400 多像素，鉴权一落地就是一次 0.24 的 CLS
    return (
      <div className="min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-24 text-center text-ink-400">加载中…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <section className="relative py-8 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-6 right-10 w-64 h-64 bg-primary-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-10 w-64 h-64 bg-gold-400/15 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="text-white/70 text-sm mb-3 flex items-center gap-1">
            <Link href="/activities" className="hover:text-white">
              活动
            </Link>
            <span>/</span>
            <span className="text-white">发布新活动</span>
          </nav>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">发布新活动</h1>
          <p className="text-white/80 mt-1 text-sm">填写活动信息，发布后弟兄姊妹即可报名</p>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <form onSubmit={submit} className="bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100 space-y-5">
            {(localError || error) && (
              <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
                {localError || error}
              </div>
            )}

            <div>
              <label htmlFor="activity-title" className="block text-sm font-semibold text-ink-700 mb-1.5">活动标题</label>
              <input
                id="activity-title"
                name="title"
                className="input-styled"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：青年团契查经会"
              />
            </div>

            <div>
              <label htmlFor="activity-description" className="block text-sm font-semibold text-ink-700 mb-1.5">活动介绍</label>
              <textarea
                id="activity-description"
                name="description"
                className="input-styled min-h-[110px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="详细介绍活动内容、流程与注意事项"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="activity-category" className="block text-sm font-semibold text-ink-700 mb-1.5">分类</label>
                <select
                  id="activity-category"
                  name="category"
                  className="input-styled"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="activity-city" className="block text-sm font-semibold text-ink-700 mb-1.5">城市</label>
                <select
                  id="activity-city"
                  name="city"
                  className="input-styled"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="activity-location" className="block text-sm font-semibold text-ink-700 mb-1.5">地点</label>
                <input
                  id="activity-location"
                  name="location"
                  autoComplete="street-address"
                  className="input-styled"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="如：XX 教会副堂"
                />
              </div>
              <div>
                <label htmlFor="activity-capacity" className="block text-sm font-semibold text-ink-700 mb-1.5">人数上限</label>
                <input
                  id="activity-capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="input-styled"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="activity-start-at" className="block text-sm font-semibold text-ink-700 mb-1.5">开始时间</label>
              <input
                id="activity-start-at"
                name="startAt"
                type="datetime-local"
                className="input-styled"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </div>

            <div role="group" aria-labelledby="activity-geo-label">
              <label id="activity-geo-label" className="block text-sm font-semibold text-ink-700 mb-1.5">地点坐标（选填）</label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={locateByAddress}
                  disabled={geocoding}
                  className="text-xs px-3 py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition disabled:opacity-60"
                >
                  {geocoding ? '定位中…' : '用地址定位'}
                </button>
                {form.lat != null && form.lng != null && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, lat: null, lng: null }))}
                    className="text-xs px-3 py-2 rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-50 transition"
                  >
                    清除坐标
                  </button>
                )}
              </div>
              {geoMsg && <p className="text-xs text-ink-500 mb-2">{geoMsg}</p>}
              {form.lat != null && form.lng != null ? (
                <LocationMap
                  lat={form.lat}
                  lng={form.lng}
                  title={form.location || form.title}
                  height={220}
                  interactive
                  onPick={({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))}
                />
              ) : (
                <p className="text-xs text-ink-400">填写地址后点「用地址定位」，或在地图上点选以标注活动位置。</p>
              )}
            </div>

            <div>
              <label id="activity-cover-label" className="block text-sm font-semibold text-ink-700 mb-2">封面</label>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="activity-cover-label">
                {COVERS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm({ ...form, cover: c })}
                    aria-label={`封面图案 ${COVER_NAME[c] || c}`}
                    title={`封面图案 ${COVER_NAME[c] || c}`}
                    aria-pressed={form.cover === c}
                    className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-all ${
                      form.cover === c ? 'bg-primary-100 ring-2 ring-primary-500' : 'bg-ink-50 hover:bg-ink-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Link href="/activities" className="btn-secondary flex-1 text-center">
                取消
              </Link>
              <button type="submit" disabled={pending} className="btn-primary flex-1 disabled:opacity-70">
                {pending ? '发布中…' : '发布活动'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
