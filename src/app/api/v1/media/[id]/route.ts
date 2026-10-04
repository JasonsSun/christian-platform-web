import { NextRequest } from 'next/server';
import { exec, one, q, ts } from '@/server/db';
import { ok, withApi, notFound, forbidden, conflict, clientIp } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { publicUrlFor, kindLabel } from '@/server/media';
import { rateLimitAsync } from '@/server/ratelimit';

export const dynamic = 'force-dynamic';

async function loadMedia(id: string) {
  return one<any>(`SELECT * FROM media_files WHERE id = ?`, [id]);
}

/** 媒体详情:审核通过对所有人可见;否则仅作者/管理员可见。
 *  例外:直播回放(source='live')被驳回后录像已被物理清理,任何人(含主播本人)都看不了。 */
export const GET = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  // 已审核媒体允许匿名访问;未审核仅作者/管理员可见
  let user: UserRow | null = null;
  try {
    user = (await requireUser(req)) as UserRow;
  } catch {
    user = null;
  }
  const m = await loadMedia(ctx.params.id);
  if (!m) throw notFound('文件不存在');
  // 直播回放被驳回 = 录像已删,连主播本人也不能回看
  if (m.source === 'live' && m.review_status === 'rejected') {
    throw forbidden('该直播回放已被驳回，不能回看');
  }
  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  const isOwner = !!user && m.owner_id === user.id;
  if (m.review_status !== 'approved' && !isStaff && !isOwner) {
    throw forbidden(m.source === 'live'
      ? '该直播回放正在审核中，通过后即可观看'
      : '该文件尚未通过审核');
  }

  const tasks = await q<any>(
    `SELECT id, task_type, status, attempts, error_message, output,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM media_processing_tasks WHERE media_file_id = ? ORDER BY created_at`,
    [m.id]
  );
  const refs = await q<any>(
    `SELECT cm.content_id, c.title FROM content_media cm
     LEFT JOIN contents c ON c.id = cm.content_id WHERE cm.media_file_id = ?`, [m.id]
  );
  const owner = await one<any>(`SELECT display_name FROM users WHERE id = ?`, [m.owner_id]);
  const related = await q<any>(
    `SELECT id, title, kind, extension, storage_key, poster_key, duration_sec, play_count, size_bytes,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM media_files
     WHERE id <> ? AND review_status = 'approved' AND status <> 'trashed' AND kind = ?
     ORDER BY created_at DESC LIMIT 8`, [m.id, m.kind]
  );
  return ok({
    id: m.id, kind: m.kind, kindLabel: kindLabel(m.kind), title: m.title || m.file_name,
    fileName: m.file_name, mimeType: m.mime_type, extension: m.extension,
    sizeBytes: Number(m.size_bytes), checksum: m.checksum,
    url: m.storage_key ? publicUrlFor(m.storage_key) : '',
    posterUrl: m.poster_key ? publicUrlFor(m.poster_key) : '',
    durationSec: Number(m.duration_sec || 0), playCount: Number(m.play_count || 0),
    description: m.description || '',
    status: m.status, reviewStatus: m.review_status, reviewReason: m.review_reason,
    ownerId: m.owner_id, owner: owner?.display_name || '', createdAt: m.created_at,
    tasks: tasks.map((t) => ({
      id: t.id, taskType: t.task_type, status: t.status, attempts: Number(t.attempts),
      error: t.error_message, output: t.output, createdAt: t.created_at,
    })),
    references: refs.map((r) => ({ contentId: r.content_id, title: r.title || '' })),
    related: related.map((r) => ({
      id: r.id, title: r.title, kind: r.kind, extension: r.extension,
      url: r.storage_key ? publicUrlFor(r.storage_key) : '',
      posterUrl: r.poster_key ? publicUrlFor(r.poster_key) : '',
      durationSec: Number(r.duration_sec || 0), playCount: Number(r.play_count || 0),
      sizeBytes: Number(r.size_bytes), createdAt: r.created_at,
    })),
  });
});

/**
 * 播放计数。
 *
 * 匿名可调用（未审核资源除外），且属于写入操作，因此必须防刷 ——
 * 否则循环脚本能把任意资源的播放量刷到任意数字。两层保护与 /songs/[id] 一致：
 * 同一 IP 对同一资源 30s 内只计一次；同一 IP 每分钟最多 60 次。
 * 超限不报错，返回当前计数但不再自增。
 */
export const POST = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const m = await loadMedia(ctx.params.id);
  if (!m) throw notFound('文件不存在');
  if (m.review_status !== 'approved') throw forbidden('该文件尚未通过审核');

  const currentCount = Number(m.play_count || 0);
  const ip = clientIp(req);
  const perIp = await rateLimitAsync(`mplay:ip:${ip}`, 60, 60_000);
  if (!perIp.ok) return ok({ id: m.id, playCount: currentCount, counted: false });

  const perMedia = await rateLimitAsync(`mplay:media:${ip}:${m.id}`, 1, 30_000);
  if (!perMedia.ok) return ok({ id: m.id, playCount: currentCount, counted: false });

  await exec(`UPDATE media_files SET play_count = play_count + 1 WHERE id = ?`, [m.id]);
  return ok({ id: m.id, playCount: currentCount + 1, counted: true });
});

/** 软删除到回收站(作者或管理员);有业务引用时禁止删除 */
export const DELETE = withApi(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await requireUser(req) as UserRow;
  const m = await loadMedia(ctx.params.id);
  if (!m) throw notFound('文件不存在');
  const isStaff = user.role === 'admin';
  if (m.owner_id !== user.id && !isStaff) throw forbidden('无权删除该文件');
  if (m.status === 'trashed') return ok({ id: m.id, status: 'trashed', alreadyTrashed: true });

  const ref = await one<any>(`SELECT COUNT(*) AS c FROM content_media WHERE media_file_id = ?`, [m.id]);
  const refCount = Number(ref?.c || 0);
  if (refCount > 0) throw conflict(`该文件被 ${refCount} 个内容引用，请先解除引用后再删除`);

  await exec(`UPDATE media_files SET status='trashed', updated_at=? WHERE id=?`, [ts(), m.id]);
  await audit(user.id, 'MEDIA_TRASH', 'media', m.id, `软删除：${m.file_name}`, clientIp(req));
  return ok({ id: m.id, status: 'trashed', trashed: true });
});
