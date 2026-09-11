// 临时脚本：本地二次校验用，签一个 admin access token 供无头截图注入（用完即删）
import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

const env = {};
const raw = fs.readFileSync('.env.local', 'utf8');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const conn = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '123456',
  database: env.DB_NAME || 'christian_platform',
});
const [rows] = await conn.execute("select id, role from users where role = 'admin' limit 1");
await conn.end();

if (!rows.length) {
  console.log('NO_ADMIN_USER');
  process.exit(1);
}

const SECRET = env.JWT_SECRET || 'change-me-in-production-change-me-in-production';
const b64 = (s) => Buffer.from(s).toString('base64url');
const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const data = b64(JSON.stringify({
  sub: rows[0].id,
  role: rows[0].role,
  typ: 'access',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'christian-platform',
}));
const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${data}`).digest('base64url');

fs.mkdirSync('F:/sjjob/shots', { recursive: true });
fs.writeFileSync('F:/sjjob/shots/admintok.txt', `${head}.${data}.${sig}`);
console.log('MINTED_FOR=', rows[0].id, 'role=', rows[0].role);
