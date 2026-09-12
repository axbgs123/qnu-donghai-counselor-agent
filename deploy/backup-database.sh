#!/usr/bin/env bash
set -euo pipefail

qz_backup_root="/var/backups/qz-zhifu"
qz_timestamp="$(date +%Y%m%d-%H%M%S)"
qz_source_db="$(find /var/lib/qz-zhifu/wrangler/v3/d1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' -print -quit)"

if [[ -z "${qz_source_db}" ]]; then
  echo "泉师智辅数据库文件不存在" >&2
  exit 1
fi

install -d -m 700 "${qz_backup_root}"
sqlite3 "${qz_source_db}" ".backup '${qz_backup_root}/database-${qz_timestamp}.sqlite'"
find "${qz_backup_root}" -type f -name 'database-*.sqlite' -mtime +7 -delete
