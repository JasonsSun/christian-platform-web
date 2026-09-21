'use client';

import { Fragment, useState } from 'react';
import { apiPost, apiPatch, apiDelete } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { AdminLayout, SectionTitle, StatCard, Badge, Loading, Empty, ErrorBox, PageHead, Toolbar } from '../_components';
import {
  CHANNEL_LABEL, notifTypeLabel, channelLabel, NOTIF_TYPE_ICON,
} from '@/lib/notificationMeta';
import { Glyph } from '@/components/icons';

interface Template {
  id: string; code: string; channel: string; titleTpl: string; bodyTpl: string; enabled: boolean;
}

interface NotifData {
  totals: { total: number; unread: number; templates: number };
  templates: Template[];
  byType: { type: string; c: number; unread: number }[];
  byChannel: { channel: string; c: number; enabled: number }[];
  recent: { id: string; type: string; title: string; body: string; read: boolean; createdAt: string; user: string }[];
}

const CHANNELS = ['inapp', 'push', 'email', 'sms', 'wechat'];
const EMPTY_FORM = { code: '', channel: 'inapp', titleTpl: '', bodyTpl: '', enabled: true };

export default function AdminNotificationsPage() {
  const { data, loading, error, reload } = useApi<NotifData>('/admin/notifications', []);
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null);   // 新增表单
  const [editing, setEditing] = useState<string | null>(null);        // 正在编辑的模板 id
  const [draft, setDraft] = useState<typeof EMPTY_FORM | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<string>('');

  const templates = data?.templates || [];

  function tip(text: string, isErr = false) {
    setMsg(isErr ? '' : text);
    setErr(isErr ? text : '');
  }

  async function create() {
    if (!form) return;
    setBusy('new'); tip('');
    try {
      await apiPost('/admin/notification-templates', form);
      tip(`模板「${form.code}」已新增`);
      setForm(null);
      reload();
    } catch (e: any) {
      tip(e?.message || '新增失败', true);
    } finally { setBusy(''); }
  }

  async function save(id: string) {
    if (!draft) return;
    setBusy(id); tip('');
    try {
      await apiPatch(`/admin/notification-templates/${id}`, draft);
      tip(`模板「${draft.code}」已保存`);
      setEditing(null); setDraft(null);
      reload();
    } catch (e: any) {
      tip(e?.message || '保存失败', true);
    } finally { setBusy(''); }
  }

  async function toggle(t: Template) {
    setBusy(t.id); tip('');
    try {
      await apiPatch(`/admin/notification-templates/${t.id}`, { enabled: !t.enabled });
      tip(`模板「${t.code}」已${t.enabled ? '停用' : '启用'}`);
      reload();
    } catch (e: any) {
      tip(e?.message || '操作失败', true);
    } finally { setBusy(''); }
  }

  async function remove(id: string) {
    setBusy(id); tip('');
    try {
      await apiDelete(`/admin/notification-templates/${id}`);
      tip('模板已删除');
      setConfirmDel('');
      reload();
    } catch (e: any) {
      tip(e?.message || '删除失败', true);
    } finally { setBusy(''); }
  }

  /** 模板编辑器（新增与编辑共用一套字段） */
  function editorRow(key: string, f: typeof EMPTY_FORM, onChange: (v: typeof EMPTY_FORM) => void, onSave: () => void, onCancel: () => void) {
    const isNew = key === 'new';
    return (
      <tr key={key} className="border-t-2 border-primary-200 bg-primary-50/40">
        <td colSpan={5} className="px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-ink-500">模板编码（英文小写，字母开头，用于代码里引用）</span>
              <input
                value={f.code}
                onChange={(e) => onChange({ ...f, code: e.target.value })}
                placeholder="例如 activity_reminder"
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-sm text-ink-900 focus:border-primary-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-500">发送渠道</span>
              <select
                value={f.channel}
                onChange={(e) => onChange({ ...f, channel: e.target.value })}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{CHANNEL_LABEL[c] || c}（{c}）</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-ink-500">标题模板（{f.titleTpl.length}/200）</span>
              <input
                value={f.titleTpl}
                onChange={(e) => onChange({ ...f, titleTpl: e.target.value.slice(0, 200) })}
                placeholder="例如 新的活动:{{title}}"
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-ink-500">正文模板（{f.bodyTpl.length}/500，变量用 {'{{名称}}'} 占位）</span>
              <textarea
                value={f.bodyTpl}
                onChange={(e) => onChange({ ...f, bodyTpl: e.target.value.slice(0, 500) })}
                rows={2}
                placeholder="例如 在 {{city}} 有一场「{{title}}」活动，点击查看详情。"
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-4 sm:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={f.enabled}
                aria-label="启用该模板"
                onClick={() => onChange({ ...f, enabled: !f.enabled })}
                /* after: 只撑命中区不改视觉尺寸：开关本身 24px 高，手机上按不准 */
                className={`relative w-12 h-6 rounded-full transition after:absolute after:-inset-y-2 after:-inset-x-1 after:content-[''] ${f.enabled ? 'bg-primary-600' : 'bg-ink-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${f.enabled ? 'left-6' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-ink-600">{f.enabled ? '启用（会实际发出）' : '停用（保留配置但不发出）'}</span>
              <div className="ml-auto flex gap-2">
                <button onClick={onCancel} className="btn-secondary btn-sm text-sm px-4">取消</button>
                <button
                  onClick={onSave}
                  disabled={busy === key || !f.code.trim() || !f.titleTpl.trim()}
                  className="btn-primary btn-sm text-sm px-4 disabled:opacity-50"
                >
                  {busy === key ? '保存中…' : isNew ? '新增模板' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <AdminLayout>
      <PageHead eyebrow="运营 · 通知" title="通知中心" sub="通知模板、渠道与收发统计" />

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard title="通知总数" value={data?.totals.total ?? '—'} />
        <StatCard title="未读" value={data?.totals.unread ?? 0} />
        <StatCard title="模板数" value={data?.totals.templates ?? 0} />
      </div>

      {(msg || err) && (
        <div role={err ? 'alert' : 'status'} className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${err ? 'bg-rose-50 text-rose-700' : 'bg-primary-50 text-primary-700'}`}>
          {err || msg}
        </div>
      )}

      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
              <div className="font-medium text-ink-700">通知模板<span className="ml-2 text-xs text-ink-400">共 {templates.length} 个</span></div>
              <button
                onClick={() => { setEditing(null); setDraft(null); setForm(form ? null : { ...EMPTY_FORM }); tip(''); }}
                className="btn-primary btn-sm text-sm px-4"
              >
                {form ? '收起' : '+ 新增模板'}
              </button>
            </div>
            {/* 外层壳是 overflow-hidden：不垫一层横向滚动，窄屏下模板正文会被直接裁掉 */}
            <div className="overflow-x-auto scroll-slim">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">通知模板</caption>
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium">编码</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">渠道</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium">标题模板</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium">状态</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {form && editorRow('new', form, setForm, create, () => setForm(null))}

                  {templates.length === 0 && !form && (
                    <tr><td colSpan={5}><Empty label="还没有通知模板，点右上角「新增模板」创建" /></td></tr>
                  )}

                  {templates.map((t) => (
                    <Fragment key={t.id}>
                      <tr className="border-t border-ink-100 hover:bg-primary-50/40">
                        <td className="px-4 py-3 font-mono text-xs text-primary-700">{t.code}</td>
                        <td className="px-4 py-3"><Badge tone="primary">{channelLabel(t.channel)}</Badge></td>
                        <td className="px-4 py-3 text-ink-700">
                          {t.titleTpl}
                          {t.bodyTpl ? <div className="mt-0.5 text-xs text-ink-400 line-clamp-1">{t.bodyTpl}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {t.enabled ? <Badge tone="green">启用</Badge> : <Badge tone="gray">停用</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                if (editing === t.id) { setEditing(null); setDraft(null); return; }
                                setForm(null);
                                setEditing(t.id);
                                setDraft({ code: t.code, channel: t.channel, titleTpl: t.titleTpl, bodyTpl: t.bodyTpl, enabled: t.enabled });
                                tip('');
                              }}
                              className="btn-chip"
                            >
                              {editing === t.id ? '收起' : '编辑'}
                            </button>
                            <button
                              onClick={() => toggle(t)}
                              disabled={busy === t.id}
                              className={`btn-chip ${t.enabled ? '' : 'btn-chip-accent'} disabled:opacity-50`}
                            >
                              {t.enabled ? '停用' : '启用'}
                            </button>
                            <button
                              onClick={() => { setConfirmDel(confirmDel === t.id ? '' : t.id); tip(''); }}
                              className="btn-chip btn-chip-danger"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>

                      {confirmDel === t.id && (
                        <tr className="border-t border-rose-200 bg-rose-50/60">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-rose-700">
                                确认删除模板「{t.code}」（{channelLabel(t.channel)}）？删除后此编码的通知将回退为默认文案。
                              </span>
                              <div className="ml-auto inline-flex gap-1">
                                <button onClick={() => setConfirmDel('')} className="btn-chip">取消</button>
                                <button
                                  onClick={() => remove(t.id)}
                                  disabled={busy === t.id}
                                  className="btn-chip btn-chip-danger"
                                >
                                  确认删除
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {editing === t.id && draft && editorRow(t.id, draft, setDraft, () => save(t.id), () => { setEditing(null); setDraft(null); })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-4 shadow-soft">
              <div className="font-medium text-ink-700 mb-3">按类型分布</div>
              {(data?.byType || []).length === 0 ? <Empty label="暂无数据" /> : (
                <ul className="space-y-2 text-sm">
                  {(data?.byType || []).map((t) => (
                    <li key={t.type} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-ink-600">
                        <Glyph glyph={NOTIF_TYPE_ICON[t.type] || '🔔'} className="w-4 h-4" />
                        {notifTypeLabel(t.type)}
                      </span>
                      <span className="text-ink-900 font-medium">{t.c}<span className="text-ink-400 text-xs"> · 未读{t.unread}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="glass rounded-2xl p-4 shadow-soft">
              <div className="font-medium text-ink-700 mb-3">渠道统计</div>
              {(data?.byChannel || []).length === 0 ? <Empty label="暂无数据" /> : (
                <ul className="space-y-2 text-sm">
                  {(data?.byChannel || []).map((c) => (
                    <li key={c.channel} className="flex items-center justify-between">
                      <span className="text-ink-600">{channelLabel(c.channel)}</span>
                      <span className="text-ink-900 font-medium">{c.c} 个模板 · 启用{c.enabled}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden shadow-soft">
            <div className="px-4 py-3 font-medium text-ink-700 border-b border-ink-100">最近通知</div>
            {(data?.recent || []).length === 0 ? <Empty label="暂无通知" /> : (
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full min-w-[820px] text-sm">
                  <caption className="sr-only">最近通知</caption>
                  <thead className="bg-ink-50 text-ink-600">
                    <tr>
                      <th scope="col" className="text-left px-4 py-3 font-medium">接收人</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">类型</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">标题</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">时间</th>
                      <th scope="col" className="text-center px-4 py-3 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent || []).map((r) => (
                      <tr key={r.id} className="border-t border-ink-100">
                        <td className="px-4 py-3 text-ink-600">{r.user || '—'}</td>
                        <td className="px-4 py-3 text-ink-600">
                          <span className="mr-1 inline-flex items-center align-middle" aria-hidden><Glyph glyph={NOTIF_TYPE_ICON[r.type] || '🔔'} className="w-4 h-4" /></span>
                          {notifTypeLabel(r.type)}
                        </td>
                        <td className="px-4 py-3 text-ink-900">{r.title}<div className="text-xs text-ink-400">{r.body}</div></td>
                        <td className="px-4 py-3 text-ink-500">{formatDateTime(r.createdAt) || '—'}</td>
                        <td className="px-4 py-3 text-center">{r.read ? <Badge tone="gray">已读</Badge> : <Badge tone="gold">未读</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
