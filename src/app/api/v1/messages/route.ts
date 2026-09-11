import { NextRequest } from 'next/server';
import { q } from '@/server/db';
import { ok, withApi } from '@/server/http';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** 会话列表 */
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);

  // 屏蔽名单：不向当前用户展示与被屏蔽者的会话
  const blockedRows = await q<any>(
    `SELECT blocked_id FROM user_blocks WHERE blocker_id = ?`,
    [user.id]
  );
  const blockedSet = new Set(blockedRows.map((r: any) => r.blocked_id));

  const rows = await q<any>(
    `SELECT m.id, m.from_id, m.to_id, m.body, m.\`read\`,
            DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM messages m WHERE m.from_id = ? OR m.to_id = ? ORDER BY m.created_at DESC LIMIT 300`,
    [user.id, user.id]
  );
  const users = await q<any>(`SELECT id, username, display_name, avatar_color, city FROM users`);
  const uMap = new Map(users.map((u) => [u.id, u]));

  const conv = new Map<string, any>();
  for (const m of rows) {
    const peerId = m.from_id === user.id ? m.to_id : m.from_id;
    if (blockedSet.has(peerId)) continue; // 跳过被屏蔽者的会话
    const cur = conv.get(peerId);
    const unreadInc = m.to_id === user.id && !m.read ? 1 : 0;
    if (!cur) {
      const u = uMap.get(peerId);
      conv.set(peerId, {
        peer: {
          id: peerId,
          username: u?.username || '',
          displayName: u?.display_name || '未知用户',
          avatarColor: u?.avatar_color || '#4f6df5',
          city: u?.city || '',
        },
        lastMessage: m.body,
        lastAt: m.created_at,
        unread: unreadInc,
      });
    } else {
      cur.unread += unreadInc;
    }
  }
  return ok({ items: Array.from(conv.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)) });
});
