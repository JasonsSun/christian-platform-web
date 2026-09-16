#!/usr/bin/env bash
# CI 真实环境 e2e 编排（被 GitHub Actions / Gitee Go 调用）。
# 职责：建库 -> 迁移 -> 起生产服务(自动种子 admin/member/内容) -> 跑全部 test:e2e:* -> 收尾。
# 所有连接参数来自环境变量（CI 注入），并写入 .env.local 供 migrate / e2e 脚本读取。
set -uo pipefail

cd "$(dirname "$0")/.."   # 切到 apps/web

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-testpass}"
DB_NAME="${DB_NAME:-christian_platform}"
JWT_SECRET="${JWT_SECRET:-ci-e2e-secret-at-least-32-chars-long}"
PORT="${PORT:-3200}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "==> 写入 .env.local"
cat > .env.local <<EOF
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
EOF

echo "==> 建库 + 迁移"
node -e "
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await c.query('CREATE DATABASE IF NOT EXISTS \`'+process.env.DB_NAME+'\` DEFAULT CHARACTER SET utf8mb4');
  await c.end();
  console.log('database ready');
})().catch(e => { console.error('db init failed', e); process.exit(1); });
"
npm run migrate

echo "==> 启动生产服务 (PORT=${PORT})"
PORT="${PORT}" DB_HOST="${DB_HOST}" DB_PORT="${DB_PORT}" DB_USER="${DB_USER}" DB_PASSWORD="${DB_PASSWORD}" DB_NAME="${DB_NAME}" JWT_SECRET="${JWT_SECRET}" npm start &
SRV=$!

echo "==> 等待服务就绪 (${BASE_URL}/api/v1/settings/public)"
READY=0
for i in $(seq 1 40); do
  if node -e "fetch(process.env.U).then(r=>{if(r.ok)process.exit(0);process.exit(1)}).catch(()=>process.exit(1))" U="${BASE_URL}/api/v1/settings/public" 2>/dev/null; then
    echo "service up after ${i} tries"; READY=1; break
  fi
  sleep 2
done
if [ "$READY" -ne 1 ]; then
  echo "E2E FAILED: 服务未能在 80s 内就绪"; kill "$SRV" 2>/dev/null; exit 1
fi

echo "==> 收集 e2e 脚本（自动枚举 package.json 的 test:e2e:*，新增脚本无需改这里）"
SCRIPTS=$(node -e "
const s = require('./package.json').scripts;
Object.keys(s).filter(k => k.startsWith('test:e2e:')).forEach(k => console.log(k));
")
COUNT=$(echo "$SCRIPTS" | grep -c . )
echo "共 ${COUNT} 个 e2e 脚本"

echo "==> 运行全部 e2e 脚本"
FAIL=0
for s in $SCRIPTS; do
  echo "---- ${s} ----"
  BASE_URL="${BASE_URL}" JWT_SECRET="${JWT_SECRET}" npm run "$s" || { echo "FAILED: ${s}"; FAIL=1; }
done

echo "==> 停止服务"
kill "$SRV" 2>/dev/null || true
wait "$SRV" 2>/dev/null || true

if [ "$FAIL" -ne 0 ]; then
  echo "E2E FAILED"; exit 1
fi
echo "E2E ALL PASSED"
