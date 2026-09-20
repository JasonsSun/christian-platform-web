'use client';

import { useEffect, useState } from 'react';
import { apiPatch } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { AdminLayout, Loading, ErrorBox, Badge, PageHead, Panel } from '../_components';

interface SettingItem {
  key: string; value: string; label: string; group: string; updatedAt: string;
}

const GROUP_LABEL: Record<string, string> = {
  general: '基础设置', upload: '上传设置', notify: '通知设置', search: '搜索设置',
  module: '模块开关',
};
const GROUP_HINT: Record<string, string> = {
  module: '关闭后：导航隐藏入口、页面显示「已暂停服务」、接口返回 403。数据全部保留，重新打开即恢复；管理员与对应模块审核员仍可正常处理历史数据。',
};

export default function AdminSettingsPage() {
  const { data, loading, error, reload } = useApi<{ items: SettingItem[] }>('/admin/settings', []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data?.items) {
      const d: Record<string, string> = {};
      data.items.forEach((it) => { d[it.key] = it.value; });
      setDraft(d);
    }
  }, [data]);

  const items = data?.items || [];
  const groups = Array.from(new Set(items.map((i) => i.group)));
  const dirty = items.some((i) => draft[i.key] !== i.value);

  function set(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const changed = items.filter((i) => draft[i.key] !== i.value).map((i) => ({ key: i.key, value: draft[i.key] }));
      await apiPatch('/admin/settings', { items: changed });
      setMsg(`已保存 ${changed.length} 项配置`);
      reload();
    } catch (e: any) {
      setMsg(e?.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout>
      <PageHead
        eyebrow="系统 · 配置"
        title="系统设置"
        sub="上传、通知、搜索、维护模式等运行配置"
      />

      {loading && !data ? <Loading rows={3} /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="space-y-6" data-reveal-group>
          {groups.map((g) => (
            <Panel
              key={g}
              title={GROUP_LABEL[g] || g}
              aside={<Badge tone="primary">{items.filter((i) => i.group === g).length} 项</Badge>}
            >
              {GROUP_HINT[g] ? <p className="-mt-1 mb-4 text-xs text-ink-500 leading-relaxed">{GROUP_HINT[g]}</p> : null}
              <div className="space-y-3">
                {items.filter((i) => i.group === g).map((it) => {
                  const isBool = it.value === 'true' || it.value === 'false';
                  // 设置项 key 全局唯一，直接充当控件 id，避免在 map 里写重复的字面量 id
                  const fieldId = `setting-${it.key}`;
                  return (
                    <div key={it.key} className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:gap-4">
                      <div className="w-full lg:w-56 lg:flex-shrink-0 min-w-0">
                        <label htmlFor={isBool ? undefined : fieldId} className="block text-sm text-ink-700">{it.label || it.key}</label>
                        <div className="font-mono text-xs text-ink-400 break-all">{it.key}</div>
                      </div>
                      {isBool ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={draft[it.key] === 'true'}
                          aria-label={it.label || it.key}
                          onClick={() => set(it.key, draft[it.key] === 'true' ? 'false' : 'true')}
                          /* after: 只撑命中区不改视觉尺寸：开关本身 24px 高，手机上按不准 */
                          className={`relative w-12 h-6 shrink-0 rounded-full transition after:absolute after:-inset-y-2.5 after:-inset-x-1 after:content-[''] ${draft[it.key] === 'true' ? 'bg-primary-600' : 'bg-ink-300'}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${draft[it.key] === 'true' ? 'left-6' : 'left-0.5'}`} />
                        </button>
                      ) : (
                        <input
                          aria-label={it.label || it.key}
                          id={fieldId}
                          className="input-styled min-h-11 lg:min-h-0 flex-1"
                          value={draft[it.key] ?? ''}
                          onChange={(e) => set(it.key, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={save} disabled={busy || !dirty} className="btn-primary min-h-11 lg:min-h-0 disabled:opacity-50">
              {busy ? '保存中…' : '保存更改'}
            </button>
            {dirty ? <span className="text-sm text-gold-700">有未保存的更改</span> : null}
            {msg ? <span role="status" className="text-sm text-primary-700">{msg}</span> : null}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
