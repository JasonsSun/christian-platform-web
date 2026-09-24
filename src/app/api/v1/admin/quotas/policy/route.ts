import { NextRequest } from 'next/server';
import { exec, one, ts } from '@/server/db';
import { ok, withApi, readJson, notFound, num, HttpError, clientIp } from '@/server/http';
import { requireRole, UserRow } from '@/server/auth';
import { audit } from '@/server/services';
import { MB } from '@/server/quota';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FIELD_MAP: Record<string, string> = {
  name: 'name',
  minScore: 'min_score',
  maxVideoMb: 'max_video_mb',
  maxAudioMb: 'max_audio_mb',
  maxImageMb: 'max_image_mb',
  maxDocMb: 'max_doc_mb',
  maxVideoSeconds: 'max_video_seconds',
  maxAudioSeconds: 'max_audio_seconds',
  dailyUploads: 'daily_uploads',
  dailyMb: 'daily_bytes',
  totalMb: 'total_bytes',
};

/** 调整某一成长等级的上传配额策略 */
export const PATCH = withApi(async (req: NextRequest) => {
  const staff = (await requireRole(req, ['admin'])) as UserRow;
  const body = await readJson<any>(req);
  const level = num(body?.level, -1);
  if (level < 0) throw new HttpError(422, 'VALIDATION_FAILED', 'level 必填');

  const exists = await one<any>(`SELECT level FROM quota_policies WHERE level = ?`, [level]);
  if (!exists) throw notFound('该等级策略不存在');

  const sets: string[] = [];
  const args: any[] = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (body[key] === undefined || body[key] === null || body[key] === '') continue;
    let value: any = body[key];
    if (col === 'name') value = String(value).slice(0, 30);
    else if (col === 'daily_bytes' || col === 'total_bytes') value = Math.round(Number(value) * MB);
    else value = Math.round(Number(value));
    if (!Number.isFinite(value) && typeof value !== 'string') continue;
    sets.push(`${col} = ?`);
    args.push(value);
  }
  if (!sets.length) throw new HttpError(422, 'VALIDATION_FAILED', '没有需要更新的字段');
  sets.push('updated_at = ?');
  args.push(ts(), level);

  await exec(`UPDATE quota_policies SET ${sets.join(', ')} WHERE level = ?`, args);
  await audit(staff.id, 'QUOTA_POLICY_UPDATE', 'quota', String(level),
    `调整等级 ${level} 配额：${Object.keys(body).join(',')}`, clientIp(req));
  return ok({ level, updated: true });
});
