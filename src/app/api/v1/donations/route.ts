import { NextRequest } from 'next/server';
import { exec, newId, one, q, ts } from '@/server/db';
import { ok, withApi, readJson, HttpError, num, clientIp } from '@/server/http';
import { currentUser, requireUser, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * 捐赠专区 —— 公开名录(金额脱敏)
 *
 * 透明度规则(必须严格遵守):
 *  1. 名录对所有人开放,但金额一律显示为 ****元;
 *  2. 真实金额(amount_cents)只有在访问者为管理员时才会出现在响应体内;
 *  3. 非管理员响应中 amountCents 字段根本不存在 —— 脱敏在服务端完成,
 *     不依赖前端隐藏,因此抓包/改前端都无法看到真实金额。
 */

const isAdmin = (u: UserRow | null) => u?.role === 'admin';

/** 展示名:教会名义 -> 「xx教会」(已含"教会"则不重复);个人 -> 昵称;匿名 -> 爱心弟兄姊妹 */
function donationLabel(row: any): string {
  if (Number(row.anonymous)) return '爱心弟兄姊妹';
  if (row.donor_type === 'church') {
    const n = String(row.church_name || row.display_name || '').trim();
    if (!n) return '匿名教会';
    return /教会$/.test(n) ? n : `${n}教会`;
  }
  return String(row.display_name || '').trim() || '匿名';
}

/** 金额文案:非管理员恒为 **** */
function amountText(cents: number, admin: boolean): string {
  return admin ? formatMoney(cents) : '****';
}

export const GET = withApi(async (req: NextRequest) => {
  const viewer = await currentUser(req);
  const admin = isAdmin(viewer);
  const sp = new URL(req.url).searchParams;
  const page = num(sp.get('page'), 1);
  const pageSize = Math.min(num(sp.get('pageSize'), 20), 100);
  const keyword = (sp.get('q') || '').trim();

  // 公开名录只展示「已确认」的捐赠
  const where: string[] = ["status = 'confirmed'"];
  const args: any[] = [];
  if (keyword) {
    where.push('(display_name LIKE ? OR church_name LIKE ? OR message LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await q<any>(
    `SELECT id, donor_id, display_name, donor_type, church_name, amount_cents, message, anonymous,
            DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM donations ${whereSql}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );

  const agg = await one<any>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(amount_cents), 0) AS s,
            COUNT(DISTINCT COALESCE(NULLIF(church_name,''), NULLIF(display_name,''), donor_id)) AS d
     FROM donations ${whereSql}`,
    args
  );

  const items = rows.map((r) => {
    const cents = Number(r.amount_cents || 0);
    const item: Record<string, unknown> = {
      id: r.id,
      displayName: donationLabel(r),
      donorType: r.donor_type === 'church' ? 'church' : 'personal',
      amountText: amountText(cents, admin),
      amountVisible: admin,
      message: r.message || '',
      createdAt: r.created_at,
      mine: !!viewer && r.donor_id === viewer.id,
    };
    // 真实金额仅进入管理员响应体
    if (admin) item.amountCents = cents;
    return item;
  });

  return ok({
    items,
    total: Number(agg?.c || 0),
    totalCount: Number(agg?.c || 0),
    donorCount: Number(agg?.d || 0),
    totalAmountText: amountText(Number(agg?.s || 0), admin),
    viewerIsAdmin: admin,
    page,
    pageSize,
  });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = await readJson<{
    displayName?: string;
    donorType?: string;
    churchName?: string;
    amount?: number | string;
    message?: string;
    anonymous?: boolean;
  }>(req);

  const donorType = body.donorType === 'church' ? 'church' : 'personal';
  const yuan = Number(body.amount);
  if (!Number.isFinite(yuan) || yuan <= 0) throw new HttpError(422, 'VALIDATION_FAILED', '请填写有效的捐赠金额');
  if (yuan > 1000000) throw new HttpError(422, 'VALIDATION_FAILED', '单笔金额过大,请分次捐赠或联系管理员');
  const cents = Math.round(yuan * 100);
  if (cents < 100) throw new HttpError(422, 'VALIDATION_FAILED', '单笔捐赠不低于 1 元');

  const churchName = (body.churchName || '').trim();
  if (donorType === 'church' && !churchName) throw new HttpError(422, 'VALIDATION_FAILED', '请填写教会名称');
  if (churchName.length > 60) throw new HttpError(422, 'VALIDATION_FAILED', '教会名称过长');

  const displayName = donorType === 'church'
    ? churchName
    : (body.displayName || user.display_name || '').trim();
  if (!displayName) throw new HttpError(422, 'VALIDATION_FAILED', '请填写展示名称');
  if (displayName.length > 60) throw new HttpError(422, 'VALIDATION_FAILED', '展示名称过长');

  const message = (body.message || '').trim().slice(0, 200);
  const anonymous = body.anonymous ? 1 : 0;

  const id = newId('don');
  await exec(
    `INSERT INTO donations (id, donor_id, display_name, donor_type, church_name, amount_cents, message, anonymous, status, note, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'pending', '', ?)`,
    [id, user.id, displayName, donorType, donorType === 'church' ? churchName : '', cents, message, anonymous, ts()]
  );
  await audit(user.id, 'DONATION_SUBMIT', 'donation', id, `提交自愿捐赠登记(${donorType === 'church' ? '教会名义' : '个人'})`, clientIp(req));

  // 响应体同样不含真实金额
  return ok({ id, status: 'pending', amountText: '****' }, 201);
});
