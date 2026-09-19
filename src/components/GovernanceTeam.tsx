'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { StaffBadges } from './ModeratorBadge';
import { ADMIN_BADGE, type ModuleKey } from '@/lib/moderationModules';

/**
 * 平台治理团队公示（社区页）。
 *
 * - 公开可见：所有人（含未登录访客）都能看到每个模块由谁负责、管理员是谁
 * - 一人兼任多模块时，会出现在多个模块框里
 * - 管理员用专属金色冠冕角标，代表覆盖全部模块
 */

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  bio: string;
  church: string;
  city: string;
}

interface TeamModule {
  key: ModuleKey;
  label: string;
  fullLabel: string;
  icon: string;
  color: string;
  desc: string;
  moderators: Member[];
}

interface Team {
  admins: Member[];
  modules: TeamModule[];
}

function Avatar({ m, size = 32 }: { m: Member; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{
        backgroundColor: m.avatarColor || '#4f6df5',
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
    >
      {(m.displayName || m.username || '?').slice(0, 1)}
    </span>
  );
}

export default function GovernanceTeam() {
  const { data, loading } = useApi<Team>('/moderation/team', []);
  const admins = data?.admins || [];
  const modules = data?.modules || [];

  return (
    <div className="bg-white rounded-3xl p-5 md:p-7 shadow-soft border border-ink-100">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-2xl">🛡️</span>
        <h2 className="font-display text-xl md:text-2xl font-bold text-ink-900">平台治理团队</h2>
      </div>
      <p className="text-sm text-ink-500 mb-5">
        平台实行分模块治理：每个模块由专门的审核员负责，管理员统筹全局。
        遇到违规内容或需要申诉，可以直接找到对应模块的负责人。
      </p>

      {loading ? (
        <div className="py-8 text-center text-ink-400 text-sm">加载中…</div>
      ) : (
        <div className="space-y-5">
          {/* 管理员横幅 */}
          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: `${ADMIN_BADGE.color}12`, borderColor: `${ADMIN_BADGE.color}44` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg" aria-hidden>
                {ADMIN_BADGE.icon}
              </span>
              <span className="font-semibold text-ink-900">平台管理员</span>
              <span className="text-xs text-ink-500">统筹全部模块与系统治理</span>
            </div>
            {admins.length === 0 ? (
              <div className="text-sm text-ink-500">暂未公开管理员信息</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {admins.map((a) => (
                  <Link
                    key={a.id}
                    href={`/u/${a.username}`}
                    className="flex items-center gap-2 rounded-xl bg-ui-surface px-2.5 py-1.5 hover:bg-white transition"
                  >
                    <Avatar m={a} size={26} />
                    <span className="text-sm text-ink-800">{a.displayName}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 各模块审核员 */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => (
              <div
                key={m.key}
                className="rounded-2xl border border-ink-100 p-4 flex flex-col"
                style={{ borderTopColor: m.color, borderTopWidth: 3 }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg" aria-hidden>
                    {m.icon}
                  </span>
                  <h3 className="font-semibold text-ink-900">{m.fullLabel}</h3>
                </div>
                <p className="text-xs text-ink-500 mb-3 leading-relaxed">{m.desc}</p>

                {m.moderators.length === 0 ? (
                  <div className="mt-auto text-xs text-ink-400">暂由管理员直接负责</div>
                ) : (
                  <div className="mt-auto space-y-2">
                    {m.moderators.map((p) => (
                      <Link
                        key={p.id}
                        href={`/u/${p.username}`}
                        className="flex items-center gap-2 rounded-xl hover:bg-ink-50 px-1.5 py-1 transition -mx-1.5"
                      >
                        <Avatar m={p} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink-800 truncate">{p.displayName}</div>
                          {(p.church || p.city) && (
                            <div className="text-[11px] text-ink-400 truncate">
                              {[p.church, p.city].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        <StaffBadges role="moderator" scopes={[m.key]} compact />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
