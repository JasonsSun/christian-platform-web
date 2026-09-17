import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { readBackupFile } from '@/server/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = async (req: NextRequest, ctx: { params: { name: string } }) => {
  await requireRole(req, ['admin']);
  const name = ctx.params.name;
  const f = readBackupFile(name);
  if (!f) return new Response('文件不存在', { status: 404 });
  return new Response(new Uint8Array(f.buf), {
    status: 200,
    headers: {
      'Content-Type': f.contentType,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
};
