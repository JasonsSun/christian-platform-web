import { NextRequest } from 'next/server';
import { exec, one, q } from '@/server/db';
import { ok, withApi, num, readJson, HttpError, notFound, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit, notify } from '@/server/services';

export const dynamic = 'force-dynamic';

/** 组织管理:列表(含成员数) */
export const GET = withApi(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'moderator']);
  const sp = new URL(req.url).searchParams;
  const keyword = (sp.get('q') || '').trim();
  const status = sp.get('status') || '';
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);

  const where: string[] = [];
  const args: any[] = [];
  if (keyword) { where.push('(o.name LIKE ? OR o.city LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { where.push('o.status = ?'); args.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q<any>(
    `SELECT o.id, o.name, o.type, o.description, o.city, o.region, o.contact, o.status,
            DATE_FORMAT(o.created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
            u.display_name AS owner_name,
            (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id) AS member_count
     FROM organizations o LEFT JOIN users u ON u.id = o.owner_id
     ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  const total = await one<any>(`SELECT COUNT(*) AS c FROM organizations o ${whereSql}`, args);
  const byStatus = await q<any>(`SELECT status, COUNT(*) AS c FROM organizations GROUP BY status`);
  const byType = await q<any>(`SELECT type, COUNT(*) AS c FROM organizations GROUP BY type`);
  return ok({
    items: rows.map((r) => ({
      id: r.id, name: r.name, type: r.type, description: r.description, city: r.city,
      region: r.region, contact: r.contact, status: r.status, createdAt: r.created_at,
      owner: r.owner_name || '', memberCount: Number(r.member_count),
    })),
    total: Number(total?.c || 0), page, pageSize,
    byStatus: byStatus.map((s) => ({ status: s.status, c: Number(s.c) })),
    byType: byType.map((t) => ({ type: t.type, c: Number(t.c) })),
  });
});

/** 组织管理:审核通过 / 驳回（审核员与管理员均可执行审核动作） */
export const PATCH = withApi(async (req: NextRequest) => {
  const staff = (await requireRole(req, ['admin', 'moderator'])) as UserRow;
  const body = await readJson<{ orgId?: string; status?: string }>(req);
  if (!body.orgId) throw new HttpError(400, 'BAD_REQUEST', '缺少 orgId');
  if (!body.status || !['approved', 'rejected', 'pending'].includes(body.status)) {
    throw new HttpError(422, 'VALIDATION_FAILED', '状态无效');
  }
  const org = await one<any>(`SELECT id, name, owner_id FROM organizations WHERE id = ?`, [body.orgId]);
  if (!org) throw notFound('组织不存在');
  await exec(`UPDATE organizations SET status = ? WHERE id = ?`, [body.status, body.orgId]);
  await audit(staff.id, 'ORG_STATUS_CHANGE', 'organization', body.orgId, `${org.name} -> ${body.status}`, clientIp(req));
  if (org.owner_id) {
    await notify(org.owner_id, 'org_review', '组织审核结果',
      `「${org.name}」审核状态:${body.status}`, '/nearby');
  }
  return ok({ id: body.orgId, status: body.status, updated: true });
});

/**
 * 删除组织（仅管理员；审核员只负责审核，不能删除）。
 * 高风险不可逆操作，前端须经 /confirm 二次确认。
 * 级联：organization_members 由外键级联清除。
 */
export const DELETE = withApi(async (req: NextRequest) => {
  const admin = (await requireRole(req, ['admin'])) as UserRow;
  const sp = new URL(req.url).searchParams;
  let orgId = sp.get('id') || '';
  if (!orgId) {
    const body = await readJson<{ orgId?: string }>(req).catch(() => ({ orgId: '' }));
    orgId = body.orgId || '';
  }
  if (!orgId) throw new HttpError(400, 'BAD_REQUEST', '缺少 id');

  const org = await one<any>(`SELECT id, name, owner_id FROM organizations WHERE id = ?`, [orgId]);
  if (!org) throw notFound('组织不存在');

  await exec(`DELETE FROM organizations WHERE id = ?`, [orgId]);
  await audit(admin.id, 'ORG_DELETE', 'organization', orgId, `删除组织「${org.name}」`, clientIp(req));
  if (org.owner_id) {
    await notify(org.owner_id, 'org_deleted', '组织已被删除',
      `你创建的组织「${org.name}」已被平台管理员删除。`, '/nearby');
  }
  return ok({ id: orgId, deleted: true });
});
