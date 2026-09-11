'use client';

import { useState } from 'react';
import Link from 'next/link';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { ActivityItem, GroupItem } from '@/lib/types';

const CITIES = ['上海', '北京', '杭州', '广州', '深圳', '成都', '南京'];

interface UserCard {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarColor: string;
  bio?: string;
  city?: string;
  church?: string;
  followers: number;
  contents: number;
  following: boolean;
}

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function NearbyPage() {
  const { user } = useAuth();
  const [city, setCity] = useState(CITIES[0]);

  const activities = useApi<{ items: ActivityItem[] }>(`/activities${qs({ scope: 'all', city, pageSize: 12 })}`, [city]);
  const groupsAll = useApi<{ items: GroupItem[] }>(`/groups${qs({ pageSize: 50 })}`, []);
  const users = useApi<{ items: UserCard[] }>(`/users${qs({ city, pageSize: 20 })}`, [city]);

  const groups = (groupsAll.data?.items || []).filter((g) => g.city === city);
  const aItems = activities.data?.items || [];
  const uItems = users.data?.items || [];

  const anyLoading = activities.loading || groupsAll.loading || users.loading;
  const anyError = activities.error || groupsAll.error || users.error;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900 mb-2">同城</h1>
      <p className="text-ink-500 mb-6">找到你所在城市的团契、活动与弟兄姐妹</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              city === c ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/25' : 'bg-white border border-ink-200 text-ink-600 hover:bg-primary-50'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {anyLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-ink-100" />))}
        </div>
      )}

      {anyError && (
        <div className="text-center py-12">
          <p className="text-rose-600 mb-3">{anyError}</p>
          <button onClick={() => { activities.reload(); groupsAll.reload(); users.reload(); }} className="btn-secondary">重试</button>
        </div>
      )}

      {!anyLoading && !anyError && (
        <div className="space-y-10">
          {/* 活动 */}
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">📅 {city}的活动</h2>
            {aItems.length === 0 ? (
              <Empty text="该城市暂无活动" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {aItems.map((a) => (
                  <Link key={a.id} href={`/activities/${a.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{a.cover?.startsWith('http') ? '📅' : a.cover || '📅'}</span>
                      <h3 className="font-semibold text-ink-900 truncate">{a.title}</h3>
                    </div>
                    <p className="text-xs text-ink-500">{a.location} · {formatDate(a.startAt)}</p>
                    <p className="text-xs text-ink-400 mt-1">{a.confirmedCount}/{a.capacity} 人报名</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 团契 */}
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">👥 {city}的团契</h2>
            {groups.length === 0 ? (
              <Empty text="该城市暂无团契" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((g) => (
                  <Link key={g.id} href={`/groups/${g.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{g.cover?.startsWith('http') ? '👥' : g.cover || '👥'}</span>
                      <h3 className="font-semibold text-ink-900 truncate">{g.name}</h3>
                    </div>
                    <p className="text-xs text-ink-500">{g.category} · {g.memberCount} 位成员</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 用户 */}
          <section>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-4">🙌 {city}的弟兄姐妹</h2>
            {uItems.length === 0 ? (
              <Empty text="该城市暂无其他用户" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {uItems.map((u) => (
                  <Link key={u.id} href={`/users/${u.id}`} className="bg-white rounded-2xl p-4 border border-ink-100 card-hover flex items-center gap-3">
                    <Avatar name={u.displayName} color={u.avatarColor} size={44} />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink-900 truncate">{u.displayName}</h3>
                      <p className="text-xs text-ink-500 truncate">{u.church || '—'} · {u.followers} 粉丝</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-8">
      <p className="text-ink-400 text-sm">{text}</p>
    </div>
  );
}
