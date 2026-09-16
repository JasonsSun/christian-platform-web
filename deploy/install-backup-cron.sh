#!/usr/bin/env bash
# 安装 MySQL 每日备份定时任务
#
# 用法:
#   bash deploy/install-backup-cron.sh            # 每天 03:17 备份
#   BACKUP_CRON="0 4 * * *" bash deploy/install-backup-cron.sh
#   bash deploy/install-backup-cron.sh --uninstall  # 移除
#
# 说明:
#   - 幂等: 反复执行只会存在一条备份任务，不会重复追加。
#   - 只有脚本退出码非 0 时才会写 /var/log/cp-backup.err，便于事后排查。

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CRON_SCHEDULE=${BACKUP_CRON:-"17 3 * * *"}
MARKER="# cp-backup"

if [ "${1:-}" = "--uninstall" ]; then
  crontab -l 2>/dev/null | grep -v "$MARKER" | crontab - || true
  echo "[cron] 已移除备份定时任务"
  exit 0
fi

# 先自检一次：能跑通再装 cron，避免装进去一个永远失败的定时任务
echo "[cron] 先执行一次备份做自检…"
if ! bash deploy/backup.sh; then
  echo "[cron][FATAL] 自检失败，未安装定时任务。请先修复上面的报错。" >&2
  exit 1
fi

# 用绝对路径 + 显式 cd，避免 cron 环境 PATH/工作目录不同导致失败
LINE="$CRON_SCHEDULE cd $ROOT && bash deploy/backup.sh >> /var/log/cp-backup.log 2>> /var/log/cp-backup.err $MARKER"

# 幂等写入：先清旧的同标记行，再追加
( crontab -l 2>/dev/null | grep -v "$MARKER" ; echo "$LINE" ) | crontab -

echo "[cron] 已安装:"
crontab -l | grep "$MARKER"
echo
echo "日志: /var/log/cp-backup.log （错误: /var/log/cp-backup.err）"
echo "查看: crontab -l | grep cp-backup"
echo "移除: bash deploy/install-backup-cron.sh --uninstall"
