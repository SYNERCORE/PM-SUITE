#!/usr/bin/env bash
# ProMaster nightly backup — Linux.
# Install with cron:
#   sudo crontab -e
#   0 2 * * *  /opt/procmaster/scripts/backup.sh >> /var/log/procmaster/backup.log 2>&1

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/mnt/backup/procmaster}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DB_NAME="${DB_NAME:-procmaster}"
DB_USER="${DB_USER:-procmaster}"

STAMP="$(date +%Y-%m-%d_%H%M)"
OUT_DIR="${BACKUP_ROOT}/${STAMP}"
mkdir -p "${OUT_DIR}"

# 1. Database — custom format (compressed, parallel restore possible)
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
    --host=localhost \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --format=custom \
    --file="${OUT_DIR}/procmaster.dump"

# 2. Config
cp /etc/caddy/Caddyfile           "${OUT_DIR}/Caddyfile"       || true
cp /opt/procmaster/.env           "${OUT_DIR}/env.backup"      || true
cp /etc/systemd/system/procmaster-api.service "${OUT_DIR}/"    || true

# 3. Checksum
( cd "${OUT_DIR}" && sha256sum * > SHA256SUMS )

# 4. Rotate — drop backups older than KEEP_DAYS
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name '20*' -mtime +${KEEP_DAYS} -exec rm -rf {} \;

echo "[backup] ${STAMP} → ${OUT_DIR}  ($(du -sh "${OUT_DIR}" | cut -f1))"
