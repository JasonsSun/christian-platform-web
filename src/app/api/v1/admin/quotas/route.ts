import { NextRequest } from 'next/server';
import { q, one } from '@/server/db';
import { ok, withApi, num } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { ensurePolicies, recomputeProfile } from '@/server/quota';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 配额概览:策略表 + 等级分布 + 用户画像列表 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const kw = (sp.get('kw') || '').trim();
  const level = sp.get('level') || '';
  const page = Math.max(1, num(sp.get('page'), 1));
  const pageSize = Math.min(100, Math.max(5, num(sp.get('pageSize'), 20)));

  const policies = await ensurePolicies();

  const where: string[] = [];
  const args: any[] = [];
  if (kw) {
    where.push(`(u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)`);
    args.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
  }
  if (level !== '') {
    where.push(`p.level = ?`);
    args.push(Number(level));
  }
  const wSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await one<any>(
    `SELECT COUNT(*) AS c FROM user_growth_profiles p JOIN users u ON u.id = p.user_id ${wSql}`, args
  );

  const users = await q<any>(
    `SELECT u.id, u.username, u.display_name, u.role, u.created_at,
            p.level, p.level_name, p.trust_score, p.online_seconds, p.action_count, p.active_days,
            p.visit_count, p.content_count, p.approved_content_count, p.media_count,
            p.approved_media_count, p.rejected_media_count, p.checkin_days, p.friend_count,
            p.like_received, p.violation_count, p.storage_bytes, p.account_age_days, p.computed_at
       FROM user_growth_profiles p JOIN users u ON u.id = p.user_id
       ${wSql}
      ORDER BY p.level DESC, p.trust_score DESC, p.storage_bytes DESC
      LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );

  const byLevel = await q<any>(
    `SELECT p.level, p.level_name AS name, COUNT(*) AS count,
            IFNULL(SUM(p.storage_bytes),0) AS storage_bytes
       FROM user_growth_profiles p GROUP BY p.level, p.level_name ORDER BY p.level`
  );
  const sum = await one<any>(
    `SELECT COUNT(*) AS users, IFNULL(SUM(storage_bytes),0) AS storage_bytes,
            IFNULL(AVG(trust_score),0) AS avg_score,
            IFNULL(SUM(online_seconds),0) AS online_seconds
       FROM user_growth_profiles`
  );

  return ok({
    policies,
    stats: {
      users: Number(sum?.users || 0),
      storageBytes: Number(sum?.storage_bytes || 0),
      avgScore: Math.round(Number(sum?.avg_score || 0)),
      onlineSeconds: Number(sum?.online_seconds || 0),
      byLevel: byLevel.map((r: any) => ({
        level: Number(r.level), name: r.name,
        count: Number(r.count), storageBytes: Number(r.storage_bytes),
      })),
    },
    users: users.map((r: any) => ({
      id: r.id, username: r.username, displayName: r.display_name, role: r.role,
      createdAt: r.created_at, level: Number(r.level), levelName: r.level_name,
      trustScore: Number(r.trust_score), onlineSeconds: Number(r.online_seconds),
      actionCount: Number(r.action_count), activeDays: Number(r.active_days),
      visitCount: Number(r.visit_count), contentCount: Number(r.content_count),
      approvedContentCount: Number(r.approved_content_count), mediaCount: Number(r.media_count),
      approvedMediaCount: Number(r.approved_media_count), rejectedMediaCount: Number(r.rejected_media_count),
      checkinDays: Number(r.checkin_days), friendCount: Number(r.friend_count),
      likeReceived: Number(r.like_received), violationCount: Number(r.violation_count),
      storageBytes: Number(r.storage_bytes), accountAgeDays: Number(r.account_age_days),
      computedAt: r.computed_at,
    })),
    page, pageSize, total: Number(totalRow?.c || 0),
  });
});

/** 批量/单个重算画像 */
export const POST = withApi(async (req: NextRequest) => {
  const staff = (await requireRole(req, ['admin', 'moderator'])) as UserRow;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || '');
  const all = body.all === true;

  if (userId) {
    const p = await recomputeProfile(userId);
    return ok({ recomputed: 1, profile: p });
  }
  const rows = all
    ? await q<{ id: string }>(`SELECT id FROM users`)
    : await q<{ id: string }>(
        `SELECT DISTINCT user_id AS id FROM user_activity_daily WHERE day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`
      );
  let done = 0;
  for (const r of rows) {
    try { await recomputeProfile(r.id); done++; } catch { /* 跳过异常用户 */ }
  }
  void staff;
  return ok({ recomputed: done, total: rows.length });
});
