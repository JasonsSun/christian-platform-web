'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { apiPost, qs } from '@/lib/api';
import { useApi, useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import { useGoLogin } from '@/lib/nav';
import type { GroupItem, ListResult } from '@/lib/types';
import { Glyph, IconCheck, IconSearch, IconUsers } from '@/components/icons';
import { groupCategoryLabel } from '@/lib/labels';

const SCOPE_TABS = [
  { id: 'all', label: '全部团契' },
  { id: 'mine', label: '我加入的' },
];

const CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: 'fellowship', label: '青年团契' },
  { value: 'study', label: '读经' },
  { value: 'prayer', label: '祷告' },
  { value: 'service', label: '服务' },
  { value: 'hobby', label: '兴趣' },
];

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

const GROUP_EMOJIS = ['👥', '📖', '🙏', '🏠', '💼', '🎓', '🌿', '✨'];

export default function GroupsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const notice = useNotice();
  const goLogin = useGoLogin();
  const [formError, setFormError] = useState('');

  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [showForm, setShowForm] = useState(false);

  const path = '/groups' + qs({ q: q || undefined, scope, category: category || undefined, city: city || undefined });
  const { data, loading, error, reload, setData } = useApi<ListResult<GroupItem>>(path, [scope, q, category, city]);
  const groups = data?.items || [];

  const createAction = useAction();
  const joinAction = useAction();
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    city: '',
    cover: GROUP_EMOJIS[0],
  });

  const submitCreate = useCallback(async () => {
    setFormError('');
    if (!user) {
      notice.info('请先登录后再创建团契');
      goLogin();
      return;
    }
    if (!form.name.trim()) {
      setFormError('请填写团契名称');
      notice.error('请填写团契名称');
      return;
    }
    const res = await createAction.run(() =>
      apiPost<GroupItem>('/groups', {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        city: form.city.trim(),
        cover: form.cover,
      })
    );
    if (res?.id) {
      setShowForm(false);
      setForm({ name: '', description: '', category: '', city: '', cover: GROUP_EMOJIS[0] });
      reload();
    }
  }, [user, form, createAction, goLogin, notice, reload]);

  const handleJoin = useCallback(
    async (g: GroupItem) => {
      if (!user) {
        notice.info('请先登录后再加入团契');
        goLogin();
        return;
      }
      const res = await joinAction.run(() =>
        apiPost<{ joined: boolean; memberCount: number }>(`/groups/${g.id}/join`)
      );
      if (res) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((x) =>
              x.id === g.id ? { ...x, joined: res.joined, memberCount: res.memberCount } : x
            ),
          };
        });
      }
    },
    [user, joinAction, goLogin, notice, setData]
  );

  return (
    <div className="min-h-screen">
      <section className="relative py-8 md:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-6 right-10 w-64 h-64 bg-primary-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-10 w-64 h-64 bg-gold-400/15 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div>
            <div className="eyebrow mb-1.5"><span className="text-gold-200/90">FELLOWSHIP</span></div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">团契</h1>
            <p className="text-white/80 mt-1 text-sm">找到属灵的家，彼此扶持同行</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-gold flex-shrink-0 text-sm">
            {showForm ? '收起' : '创建团契'}
          </button>
        </div>
      </section>

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 创建表单 */}
          {showForm && (
            <div className="glow-edge bg-white rounded-3xl p-5 md:p-8 shadow-soft border border-ink-100 mb-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-ink-900">创建新团契</h2>
              {formError && (
                <div id="group-create-error" role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
                  {formError}
                </div>
              )}
              <input
                name="name"
                aria-label="团契名称"
                aria-describedby={formError ? 'group-create-error' : undefined}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="团契名称"
                className="input-styled"
              />
              <textarea
                name="description"
                aria-label="团契简介"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="团契简介"
                rows={3}
                className="input-styled resize-y"
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <select
                  name="category"
                  aria-label="团契分类"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input-styled"
                >
                  <option value="">选择分类</option>
                  {CATEGORIES.filter((c) => c.value).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <input
                  name="city"
                  aria-label="所在城市"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="城市（如：北京）"
                  className="input-styled"
                />
              </div>
              <div>
                <label id="group-cover-label" className="block text-sm font-semibold text-ink-700 mb-2">封面 Emoji</label>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="group-cover-label">
                  {GROUP_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setForm({ ...form, cover: e })}
                      aria-pressed={form.cover === e}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                        form.cover === e
                          ? 'bg-primary-100 border-2 border-primary-500 text-primary-700'
                          : 'bg-ink-50 border-2 border-transparent text-ink-500 hover:border-primary-200'
                      }`}
                    >
                      <Glyph glyph={e} className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              </div>
              {createAction.error && (
                <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-sm">{createAction.error}</div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  取消
                </button>
                <button onClick={submitCreate} disabled={createAction.pending} className="btn-primary flex-1">
                  {createAction.pending ? '创建中…' : '确认创建'}
                </button>
              </div>
            </div>
          )}

          {/* 筛选栏 */}
          <div className="bg-white rounded-2xl p-4 border border-ink-100 shadow-soft mb-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 bg-ink-50 rounded-xl p-1" role="group" aria-label="团契范围筛选">
                {SCOPE_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setScope(t.id as 'all' | 'mine')}
                    aria-pressed={scope === t.id}
                    className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                      scope === t.id
                        ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25'
                        : 'text-ink-600 hover:text-primary-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2 text-sm text-ink-500">
                {!loading && (
                  <>
                    共 <span className="num font-semibold text-ink-700">{data?.total ?? groups.length}</span> 个团契
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <IconSearch className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.6} />
                <input
                  name="q"
                  aria-label="搜索团契名称或简介"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索团契名称或简介…"
                  className="input-styled input-icon"
                />
              </div>
              <select className="input-styled" name="filterCategory" aria-label="按分类筛选" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select className="input-styled" name="filterCity" aria-label="按城市筛选" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">全部城市</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 网格是常驻的，骨架却无条件画在上面：换筛选/打字时同一屏出现两份内容
              （六张假卡压在真卡上方）。有结果就只压暗，不再叠骨架。 */}
          {loading && groups.length === 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-ink-100 shadow-soft min-h-[176px] space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-ink-100 skeleton-sheen flex-shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="h-4 w-2/3 bg-ink-100 rounded skeleton-sheen" />
                      <div className="h-3 w-1/3 bg-ink-100 rounded skeleton-sheen" />
                    </div>
                  </div>
                  <div className="h-3 w-full bg-ink-100 rounded skeleton-sheen" />
                  <div className="h-3 w-4/5 bg-ink-100 rounded skeleton-sheen" />
                </div>
              ))}
            </div>
          )}
          {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm">{error}</div>}
          {!loading && !error && groups.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-ink-200">
              <span className="inline-flex w-12 h-12 rounded-2xl bg-ink-50 text-ink-400 items-center justify-center mb-3">
                <IconUsers className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="text-ink-400 text-sm">
                {scope === 'mine' ? '你还没有加入任何团契' : '没有找到团契，点击右上角创建吧～'}
              </p>
            </div>
          )}

          <div data-reveal-group className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 transition-opacity duration-200 ${loading && groups.length ? 'opacity-60' : 'opacity-100'}`}>
            {groups.map((g) => {
              const catLabel = groupCategoryLabel(g.category);
              return (
                <div
                  key={g.id}
                  data-spot
                  className="spot card-hover bg-white rounded-2xl p-5 border border-ink-100 shadow-soft flex flex-col"
                >
                  <Link href={`/groups/${g.id}`} className="flex items-center gap-4 mb-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white flex-shrink-0">
                      <Glyph glyph={g.cover || '👥'} className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-ink-900 truncate">{g.name}</h2>
                      <p className="text-xs text-ink-400">{catLabel} · {g.city || '线上'}</p>
                    </div>
                  </Link>
                  <p className="text-sm text-ink-500 line-clamp-2 mb-3 leading-relaxed">{g.description}</p>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center gap-1 text-sm text-ink-500">
                      <IconUsers className="w-4 h-4 text-primary-500" strokeWidth={1.6} />
                      <span className="num">{g.memberCount}</span> 成员
                    </span>
                    {g.joined ? (
                      <span className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        <IconCheck className="w-3.5 h-3.5" strokeWidth={1.6} />
                        已加入
                      </span>
                    ) : (
                      <span className="ml-auto text-xs text-ink-400">未加入</span>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Link
                      href={`/groups/${g.id}`}
                      className="btn-secondary btn-sm flex-1 text-sm"
                      aria-label={`查看 ${g.name} 详情`}
                    >
                      查看详情
                    </Link>
                    {g.joined ? (
                      <Link
                        href={`/groups/${g.id}`}
                        className="btn-primary btn-sm flex-1 text-sm"
                        aria-label={`进入 ${g.name}`}
                      >
                        进入团契
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleJoin(g)}
                        disabled={joinAction.pending}
                        className="btn-gold btn-sm flex-1 text-sm disabled:opacity-70"
                        aria-label={`加入 ${g.name}`}
                      >
                        {joinAction.pending ? '加入中…' : '加入团契'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
