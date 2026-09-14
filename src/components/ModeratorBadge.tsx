'use client';

import {
  ADMIN_BADGE,
  MODULE_META,
  MODULE_ORDER,
  isModuleKey,
  type ModuleKey,
} from '@/lib/moderationModules';

/**
 * 治理身份角标。
 *
 * - 管理员：统一用「👑 管理员」金色角标，代表全平台治理者（覆盖全部模块）
 * - 模块审核员：按模块渲染专属图标 + 配色，如「🕊️ 代祷审核员」
 * - 一人兼任多模块时，横向堆叠显示多个角标
 */

function Chip({
  icon,
  label,
  color,
  title,
}: {
  icon: string;
  label: string;
  color: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap"
      style={{
        // 8 位 hex：末两位是透明度，形成"浅底 + 主色文字/描边"的柔和角标
        backgroundColor: `${color}1f`,
        borderColor: `${color}55`,
        color,
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

/** 管理员专属角标（全模块） */
export function AdminBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Chip
      icon={ADMIN_BADGE.icon}
      label={compact ? ADMIN_BADGE.label : ADMIN_BADGE.fullLabel}
      color={ADMIN_BADGE.color}
      title={ADMIN_BADGE.desc}
    />
  );
}

/** 单个模块审核员角标 */
export function ModuleBadge({ module, compact = false }: { module: ModuleKey; compact?: boolean }) {
  const meta = MODULE_META[module];
  if (!meta) return null;
  return (
    <Chip
      icon={meta.icon}
      label={compact ? meta.label : `${meta.label}审核员`}
      color={meta.color}
      title={meta.desc}
    />
  );
}

/** 根据角色 + 模块范围渲染完整治理身份（管理员 / 多模块堆叠 / 普通成员无） */
export function StaffBadges({
  role,
  scopes,
  compact = false,
  max,
}: {
  role: string;
  /** 接受 string[]（接口返回的原始值），内部会过滤掉非法的模块 key */
  scopes?: readonly string[];
  compact?: boolean;
  /** 最多显示几个模块角标，超出折叠为 +N */
  max?: number;
}) {
  if (role === 'admin') return <AdminBadge compact={compact} />;
  if (role !== 'moderator') return null;

  const list = (scopes || []).filter(isModuleKey);
  if (!list.length) return null;

  const limit = max ?? list.length;
  const shown = list.slice(0, limit);
  const rest = list.length - shown.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((k) => (
        <ModuleBadge key={k} module={k} compact={compact} />
      ))}
      {rest > 0 ? (
        <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium leading-5 text-ink-500">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export { MODULE_META, MODULE_ORDER };
export type { ModuleKey };
