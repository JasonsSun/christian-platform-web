'use client';

import { Fragment, useMemo, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { apiGet, apiPatch } from '@/lib/api';
import { AdminLayout, SectionTitle, Badge, Loading, ErrorBox } from '../_components';
import { StaffBadges } from '@/components/ModeratorBadge';

interface ModuleInfo {
  key: string;
  label: string;
  fullLabel: string;
  icon: string;
  color: string;
  desc: string;
}

interface StaffRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  scopes: string[];
  createdAt: string;
}

interface RoleData {
  roles: { key: string; label: string; desc: string; count: number; permissions: string[] }[];
  groups: { group: string; items: string[] }[];
  matrix: Record<string, string[]>;
  modules: ModuleInfo[];
  staff: StaffRow[];
}

interface UserHit {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
}

export default function AdminRolesPage() {
  const { data, loading, error, reload } = useApi<RoleData>('/admin/roles', []);
  const roles = data?.roles || [];
  const groups = data?.groups || [];
  const modules = data?.modules || [];
  const staff = data?.staff || [];

  // 每行待保存的模块勾选
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  // 添加审核员：搜索普通成员
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<UserHit[]>([]);

  const has = (role: string, perm: string) => (data?.matrix?.[role] || []).includes(perm);

  const scopesOf = (row: StaffRow) => (draft[row.id] !== undefined ? draft[row.id] : row.scopes);

  const toggle = (id: string, key: string, current: string[]) => {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setDraft((d) => ({ ...d, [id]: next }));
  };

  const save = async (id: string, mods: string[]) => {
    setSaving(id);
    setMsg('');
    try {
      await apiPatch('/admin/roles', { userId: id, modules: mods });
      setMsg(mods.length ? '已保存模块范围' : '已撤销该成员的审核员身份');
      setDraft((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      setPending((p) => p.filter((x) => x.id !== id));
      await reload();
    } catch (e: any) {
      setMsg(e?.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await apiGet<{ items: UserHit[] }>(
        `/admin/users?q=${encodeURIComponent(q.trim())}&pageSize=20`
      );
      const known = new Set(staff.map((s) => s.id));
      const chosen = new Set(pending.map((p) => p.id));
      setHits((r?.items || []).filter((u) => !known.has(u.id) && !chosen.has(u.id) && u.role !== 'admin'));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const addPending = (u: UserHit) => {
    if (pending.some((p) => p.id === u.id)) return;
    setPending((p) => [...p, u]);
    setDraft((d) => ({ ...d, [u.id]: [] }));
    setHits((h) => h.filter((x) => x.id !== u.id));
  };

  const adminRows = useMemo(() => staff.filter((s) => s.role === 'admin'), [staff]);
  const modRows = useMemo(() => staff.filter((s) => s.role !== 'admin'), [staff]);

  const ModulePicker = ({
    id,
    cur,
    disabled,
  }: {
    id: string;
    cur: string[];
    disabled?: boolean;
  }) => (
    <div className="flex flex-wrap gap-2">
      {modules.map((m) => {
        const on = cur.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            title={m.desc}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(id, m.key, cur)}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-60"
            style={{
              backgroundColor: on ? `${m.color}1f` : 'transparent',
              // 模块主色只做底色和描边：它本身是 500 档，压在自己的 12% 浅底上只有
              // 1.93~3.67:1（媒体 🎬 那枚实测 1.93），当 12px 文字根本读不动。
              // 文字交给主题正文色，选中态靠色块+描边表达，另有 aria-pressed。
              // 原先写死的 #e5e7eb 描边在深色主题下等于没有边框。
              borderColor: on ? `${m.color}88` : 'var(--ui-border)',
              color: 'var(--ui-text)',
            }}
          >
            <span aria-hidden>{m.icon}</span>
            {m.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <AdminLayout>
      <SectionTitle as="h1">权限中心</SectionTitle>
      <p className="-mt-3 mb-5 text-sm text-ink-500">
        权限等级：管理员 &gt; 模块审核员 &gt; 普通成员。管理员拥有全部模块与系统治理权；
        审核员的能力严格等于这里分配的模块，一人可兼任多个模块。
      </p>

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            {roles.map((r) => (
              <div key={r.key} className="glass rounded-2xl p-5 shadow-soft card-hover">
                <div className="flex items-center justify-between">
                  <Badge tone={r.key === 'admin' ? 'gold' : r.key === 'moderator' ? 'primary' : 'gray'}>
                    {r.label}
                  </Badge>
                  <span className="text-2xl font-bold font-display text-ink-900">{r.count}</span>
                </div>
                <div className="mt-3 text-sm text-ink-500">{r.desc}</div>
                <div className="mt-3 text-xs text-ink-400">共 {r.permissions.length} 项权限</div>
              </div>
            ))}
          </div>

          {/* 管理员 */}
          <div className="glass rounded-2xl p-5 shadow-soft">
            <div className="font-medium text-ink-700 mb-1">平台管理员</div>
            <div className="text-xs text-ink-400 mb-3">
              管理员自动覆盖全部模块并拥有系统治理权，无需单独分配模块范围。
            </div>
            {adminRows.length === 0 ? (
              <div className="text-sm text-ink-400">暂无管理员</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {adminRows.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2">
                    <span className="text-sm font-medium text-ink-800">{a.displayName}</span>
                    <StaffBadges role="admin" compact />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 模块审核员配置 */}
          <div className="glass rounded-2xl p-5 shadow-soft">
            <div className="font-medium text-ink-700 mb-1">模块审核员配置</div>
            <div className="text-xs text-ink-400 mb-4">
              勾选该成员负责的模块并保存。分配首个模块时自动升为审核员；
              取消全部模块即撤销其审核员身份。
            </div>

            {msg ? <div role="status" className="mb-3 text-sm text-primary-700">{msg}</div> : null}

            {modRows.length === 0 && pending.length === 0 ? (
              <div className="text-sm text-ink-400">还没有模块审核员，可在下方添加。</div>
            ) : null}

            <div className="space-y-4">
              {modRows.map((row) => {
                const cur = scopesOf(row);
                const dirty = JSON.stringify(cur) !== JSON.stringify(row.scopes);
                return (
                  <div key={row.id} className="rounded-xl border border-ink-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-800">{row.displayName}</span>
                        <span className="text-xs text-ink-400">@{row.username}</span>
                        <StaffBadges role={row.role} scopes={cur} compact />
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="btn-secondary text-xs"
                          disabled={!dirty || saving === row.id}
                          onClick={() => save(row.id, cur)}
                        >
                          {saving === row.id ? '保存中…' : dirty ? '保存' : '已保存'}
                        </button>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          disabled={saving === row.id}
                          onClick={() => save(row.id, [])}
                        >
                          撤销审核员
                        </button>
                      </div>
                    </div>
                    <ModulePicker id={row.id} cur={cur} disabled={saving === row.id} />
                  </div>
                );
              })}

              {/* 待添加 */}
              {pending.map((p) => {
                const cur = draft[p.id] || [];
                return (
                  <div key={p.id} className="rounded-xl border border-dashed border-primary-300 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-800">{p.displayName}</span>
                        <span className="text-xs text-ink-400">@{p.username}</span>
                        <Badge tone="gray">待分配模块</Badge>
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="btn-secondary text-xs"
                          disabled={cur.length === 0 || saving === p.id}
                          onClick={() => save(p.id, cur)}
                        >
                          {saving === p.id ? '保存中…' : '保存为审核员'}
                        </button>
                        <button
                          className="text-xs text-ink-500 hover:underline"
                          onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    <ModulePicker id={p.id} cur={cur} disabled={saving === p.id} />
                  </div>
                );
              })}
            </div>

            {/* 搜索添加 */}
            <div className="mt-5 pt-4 border-t border-ink-100">
              <label htmlFor="role-member-search" className="block text-sm text-ink-600 mb-2">添加审核员</label>
              <div className="flex gap-2 mb-3">
                <input
                  id="role-member-search"
                  className="input-styled flex-1 text-sm"
                  placeholder="按用户名搜索成员"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
                />
                <button className="btn-secondary text-sm" onClick={search} disabled={searching}>
                  {searching ? '搜索中…' : '搜索'}
                </button>
              </div>
              {hits.length ? (
                <div className="flex flex-wrap gap-2">
                  {hits.map((u) => (
                    <button
                      key={u.id}
                      className="rounded-xl border border-ink-200 px-3 py-1.5 text-sm hover:border-primary-300 hover:text-primary-700"
                      onClick={() => addPending(u)}
                    >
                      + {u.displayName}（@{u.username}）
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* 权限矩阵 */}
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">权限矩阵</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">权限矩阵</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium sticky left-0 bg-ink-50">权限</th>
                    {roles.map((r) => (
                      <th scope="col" key={r.key} className="text-center px-4 py-3 font-medium whitespace-nowrap">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.group}>
                      <tr className="bg-primary-50/50">
                        <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold text-primary-700">{g.group}</td>
                      </tr>
                      {g.items.map((perm) => (
                        <tr key={perm} className="border-t border-ink-100">
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-700 sticky left-0 bg-white">{perm}</td>
                          {roles.map((r) => (
                            <td key={r.key} className="text-center px-4 py-2.5">
                              {has(r.key, perm) ? (
                                <span className="text-emerald-600 font-bold">✓</span>
                              ) : (
                                <span className="text-ink-400">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 shadow-soft">
            <div className="font-medium text-ink-700 mb-2">数据范围</div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="gray">普通成员：本人数据</Badge>
              <Badge tone="primary">模块审核员：已分配模块内的数据</Badge>
              <Badge tone="gold">管理员：全平台 + 系统配置</Badge>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
