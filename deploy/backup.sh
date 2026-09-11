#!/usr/bin/env bash
# 基督教平台 MySQL 定时备份脚本
# 手动跑一次:  bash deploy/backup.sh
# 定时备份:    见 DEPLOY.md「自动备份」一节（crontab）
#
# 特性: 按日期命名 + gzip 压缩 + 自动清理 N 天前的旧备份（默认保留 7 天）

set -euo pipefail

# 回到项目根（脚本在 deploy/ 下，项目根才有 .env）
cd "$(dirname "$0")/.."

# 从 .env 读配置（兼容带引号 / 不带引号）
get_env() { grep -E "^$1=" .env | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DB_PASSWORD=$(get_env DB_PASSWORD)
DB_NAME=$(get_env DB_NAME); DB_NAME=${DB_NAME:-christian_platform}

BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP_DAYS=${KEEP_DAYS:-7}
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/christian_platform_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker exec cp_db mysqldump -uroot -p"$DB_PASSWORD" \
  --single-transaction --default-character-set=utf8mb4 \
  --routines --triggers "$DB_NAME" | gzip > "$OUT"

# 清理 KEEP_DAYS 天之前的旧备份
find "$BACKUP_DIR" -name 'christian_platform_*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[backup] OK -> $OUT ($(du -h "$OUT" | cut -f1))"
