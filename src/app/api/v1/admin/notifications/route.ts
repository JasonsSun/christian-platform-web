import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireRole } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** 通知中心:模板 + 发送统计 + 因类分布 */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);

  const templates = await q<any>(
    `SELECT id, code, channel, title_tpl, body_tpl, enabled,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM notification_templates ORDER BY code`
  );
  const byType = await q<any>(
    `SELECT type, COUNT(*) AS c, SUM(CASE WHEN \`read\`=0 THEN 1 ELSE 0 END) AS unread
     FROM notifications GROUP BY type ORDER BY c DESC`
  );
  const totals = await q<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN \`read\`=0 THEN 1 ELSE 0 END) AS unread FROM notifications`
  );
  const byChannel = await q<any>(
    `SELECT channel, COUNT(*) AS c, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled FROM notification_templates GROUP BY channel`
  );
  const recent = await q<any>(
    `SELECT n.id, n.type, n.title, n.body, n.\`read\`, DATE_FORMAT(n.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name AS user_name
     FROM notifications n LEFT JOIN users u ON u.id = n.user_id
     ORDER BY n.created_at DESC LIMIT 10`
  );
  return ok({
    totals: { total: Number(totals[0]?.total || 0), unread: Number(totals[0]?.unread || 0), templates: templates.length },
    templates: templates.map((t) => ({
      id: t.id, code: t.code, channel: t.channel, titleTpl: t.title_tpl,
      bodyTpl: t.body_tpl, enabled: !!t.enabled, createdAt: t.created_at,
    })),
    byType: byType.map((t) => ({ type: t.type, c: Number(t.c), unread: Number(t.unread) })),
    byChannel: byChannel.map((c) => ({ channel: c.channel, c: Number(c.c), enabled: Number(c.enabled) })),
    recent: recent.map((r) => ({
      id: r.id, type: r.type, title: r.title, body: r.body, read: !!r.read,
      createdAt: r.created_at, user: r.user_name || '',
    })),
  });
});
