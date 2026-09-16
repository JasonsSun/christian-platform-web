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

# 完整性校验：备份"跑完了"和"能恢复"是两回事，gzip -t 能拦住绝大多数坏档
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "[backup][FATAL] 备份文件损坏: $OUT" >&2
  exit 1
fi
# 体积下限保护：空库 dump 也该有几十 KB，过小说明 dump 没真的拿到数据
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup][FATAL] 备份文件过小($SIZE bytes)，疑似 dump 失败: $OUT" >&2
  exit 1
fi

# 清理 KEEP_DAYS 天之前的旧备份
find "$BACKUP_DIR" -name 'christian_platform_*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[backup] OK -> $OUT ($(du -h "$OUT" | cut -f1))"
echo "[backup] 保留 $KEEP_DAYS 天，当前共 $(find "$BACKUP_DIR" -name 'christian_platform_*.sql.gz' | wc -l) 份"
