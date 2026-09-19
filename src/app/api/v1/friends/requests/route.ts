import { NextRequest } from 'next/server';
import { q, one } from '@/server/db';
import { num } from '@/server/http';
import { ok, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { whiteSafeColor } from '@/server/mappers';

export const dynamic = 'force-dynamic';

interface Peer {
  id: string;
  displayName: string;
  username: string;
  avatarColor: string;
  city: string;
  church: string;
  bio: string;
}

function mapPeer(r: any): Peer {
  return {
    id: r.uid,
    displayName: r.display_name,
    username: r.username,
    avatarColor: whiteSafeColor(r.avatar_color),
    city: r.city || '',
    church: r.church || '',
    bio: r.bio || '',
  };
}

/**
 * GET /api/v1/friends/requests?type=incoming|outgoing&pageSize=20&status=all|pending
 * incoming(默认) = 我收到的申请(peer 为发起人); outgoing = 我发出的申请(peer 为接收人)
 *
 * 返回约定(修复:已处理的申请不应继续展示可点击按钮 / 不应继续计入角标):
 * - items        待处理(pending)排最前,其后是最近已处理(accepted/declined)的记录
 * - pendingTotal 待处理条数 —— 前端角标与 Tab 计数一律用它
 * - total        兼容字段,恒等于 pendingTotal
 * - handledTotal 已处理条数
 * - status=pending 时仅返回待处理记录
 */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const sp = new URL(req.url).searchParams;
  const type = sp.get('type') || 'incoming';
  const onlyPending = sp.get('status') === 'pending';
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 50);

  const isOutgoing = type === 'outgoing';
  const ownerCol = isOutgoing ? 'requester_id' : 'addressee_id';
  const peerJoin = isOutgoing ? 'fr.addressee_id' : 'fr.requester_id';
  const statusWhere = onlyPending ? `AND fr.status = 'pending'` : '';

  const rows = await q<any>(
    `SELECT fr.id, fr.message, fr.status,
            DATE_FORMAT(fr.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.id AS uid, u.display_name, u.username, u.avatar_color, u.city, u.church, u.bio
     FROM friend_requests fr
     JOIN users u ON u.id = ${peerJoin}
     WHERE fr.${ownerCol} = ? ${statusWhere}
     ORDER BY (fr.status = 'pending') DESC, fr.created_at DESC
     LIMIT ?`,
    [user.id, pageSize]
  );

  const items = rows.map((r) => ({
    id: r.id,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    direction: isOutgoing ? 'outgoing' : 'incoming',
    peer: mapPeer(r),
  }));

  // 计数只对「待处理」有意义:角标须随处理动作实时下降
  const countRow = await one<any>(
    `SELECT SUM(status = 'pending') AS pending, SUM(status <> 'pending') AS handled
     FROM friend_requests WHERE ${ownerCol} = ?`,
    [user.id]
  );
  const pendingTotal = Number(countRow?.pending || 0);
  const handledTotal = Number(countRow?.handled || 0);

  return ok({ items, total: pendingTotal, pendingTotal, handledTotal });
});
