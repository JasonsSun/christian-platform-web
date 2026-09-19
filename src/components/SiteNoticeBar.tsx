'use client';

import { useEffect, useState } from 'react';

interface PublicSettings {
  siteName: string;
  siteNotice: string;
  maintenance: boolean;
  maintenanceNotice: string;
}

/**
 * 顶部运行公告条。
 * 数据来源是后台「系统设置」里的 site_notice / maintenance_mode / maintenance_notice，
 * 读公开接口 /api/v1/settings/public（免登录），维护期用醒目的琥珀色，
 * 普通公告用中性蓝。没有内容时完全不渲染、不占位。
 */
export default function SiteNoticeBar() {
  const [s, setS] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.data) setS(j.data as PublicSettings); })
      .catch(() => { /* 公告取不到就算了，不打扰用户 */ });
    return () => { alive = false; };
  }, []);

  if (!s) return null;
  const text = s.maintenance ? s.maintenanceNotice : s.siteNotice;
  if (!text?.trim()) return null;

  return (
    <div
      className={`w-full px-4 py-2 text-center text-sm ${
        s.maintenance
          ? 'bg-amber-100 text-amber-900 border-b border-amber-200'
          : 'bg-ui-accent-soft text-ui-accent border-b border-ui-border'
      }`}
    >
      {s.maintenance ? '维护中 · ' : ''}
      {text}
    </div>
  );
}
