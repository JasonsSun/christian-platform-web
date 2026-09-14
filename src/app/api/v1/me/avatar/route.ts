import { NextRequest } from 'next/server';
import { exec, one } from '@/server/db';
import { ok, withApi, HttpError } from '@/server/http';
import { requireUser, publicUser } from '@/server/auth';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

/**
 * POST /api/v1/me/avatar  (multipart/form-data, field "file")
 * 头像直接落盘到 public/uploads/avatars/<userId>.<ext>,由 Next 静态托管,
 * 不进 media 审核流水线(头像属个人资料,轻量即时)。落库 users.avatar_url。
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'BAD_FILE', '请选择图片文件');

  const ext = ALLOWED.get(file.type);
  if (!ext) throw new HttpError(422, 'BAD_TYPE', '仅支持 JPG / PNG / WebP 格式');
  if (file.size > MAX_BYTES) throw new HttpError(422, 'TOO_LARGE', '头像图片不能超过 2MB');

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${user.id}.${ext}`;
  await fs.writeFile(path.join(dir, fileName), buf);

  // 带时间戳防浏览器缓存
  const url = `/uploads/avatars/${fileName}?t=${Date.now()}`;
  await exec(`UPDATE users SET avatar_url=? WHERE id=?`, [url, user.id]);
  const updated = await one<any>(`SELECT * FROM users WHERE id=?`, [user.id]);

  return ok({ avatarUrl: url, user: publicUser(updated!) });
});
