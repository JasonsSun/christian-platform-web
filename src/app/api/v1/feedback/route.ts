import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { HttpError, ok, readJson, withApi } from '@/server/http';
import { requireUser, UserRow } from '@/server/auth';
import { audit, notifyRole } from '@/server/services';
import { guardWrite } from '@/server/guard';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['idea', 'bug', 'content', 'ux', 'other'];
const CATEGORY_LABEL: Record<string, string> = {
  idea: '功能建议',
  bug: '问题反馈',
  content: '内容相关',
  ux: '使用体验',
  other: '其他',
};

/**
 * POST /api/v1/feedback
 * body: { category, content, contact?, pageUrl? }
 *
 * 平台建议：用户提交，仅管理员可见（用于了解使用者需求）。
 * 只要求登录用户提交，便于回访与防刷。
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  await guardWrite(req, 'feedback', user.id);
  const b = await readJson<{ category?: string; content?: string; contact?: string; pageUrl?: string }>(req);

  const content = (b.content || '').trim();
  if (content.length < 5) throw new HttpError(400, 'BAD_REQUEST', '请至少写 5 个字，方便我们理解你的想法');
  if (content.length > 1000) throw new HttpError(400, 'BAD_REQUEST', '内容请控制在 1000 字以内');

  const category = b.category && CATEGORIES.includes(b.category) ? b.category : 'other';

  // 简单防刷：同一账号 1 分钟内最多 3 条
  const recent = await one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM platform_feedback WHERE user_id = ? AND created_at > ?`,
    [user.id, ts(Date.now() - 60_000)]
  );
  if (recent && Number(recent.c) >= 3) {
    throw new HttpError(429, 'TOO_MANY_REQUESTS', '提交过于频繁，请稍后再试');
  }

  const id = newId('fb');
  await exec(
    `INSERT INTO platform_feedback (id, user_id, category, content, contact, page_url, status, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      id,
      user.id,
      category,
      content,
      (b.contact || '').slice(0, 120),
      (b.pageUrl || '').slice(0, 255),
      'new',
      ts(),
    ]
  );

  await audit(user.id, 'FEEDBACK_SUBMIT', 'feedback', id, `平台建议：${CATEGORY_LABEL[category]}`, '');
  await notifyRole(
    ['admin'],
    'platform_feedback',
    '收到新的平台建议',
    `${user.display_name}：${content.slice(0, 40)}`,
    '/admin/feedback'
  );

  return ok({ ok: true, id });
});

/** GET /api/v1/feedback —— 我提交过的建议（含管理员回复） */
export const GET = withApi(async (req: NextRequest) => {
  const user = (await requireUser(req)) as UserRow;
  const rows = await q<any>(
    `SELECT id, category, content, status, admin_reply,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM platform_feedback
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [user.id]
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      status: r.status,
      adminReply: r.admin_reply,
      createdAt: r.created_at,
    })),
  });
});
