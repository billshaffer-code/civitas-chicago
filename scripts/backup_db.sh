#!/usr/bin/env bash
# Daily PostgreSQL backup with rotation (keeps last 3 dumps)
# Usage: bash scripts/backup_db.sh
# Crontab: 0 1 * * * /home/bill/source/Civitas/scripts/backup_db.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d)"
DUMP_FILE="$BACKUP_DIR/civitas_${TIMESTAMP}.dump"
KEEP_COUNT=3

mkdir -p "$BACKUP_DIR"

# Check that the database container is running
if ! docker exec civitas_db pg_isready -U civitas -q 2>/dev/null; then
    echo "ERROR: civitas_db container is not running or not ready" >&2
    exit 1
fi

# Create the dump
echo "Creating database backup: $DUMP_FILE"
docker exec civitas_db pg_dump -U civitas -Fc civitas > "$DUMP_FILE"

# Verify the dump is non-empty
if [ ! -s "$DUMP_FILE" ]; then
    echo "ERROR: Backup file is empty" >&2
    rm -f "$DUMP_FILE"
    exit 1
fi

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "Backup created: $DUMP_FILE ($SIZE)"

# Rotate: keep only the most recent $KEEP_COUNT dumps
cd "$BACKUP_DIR"
ls -1t civitas_*.dump 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | while read -r old; do
    echo "Removing old backup: $old"
    rm -f "$old"
done

echo "Done. Current backups:"
ls -lh "$BACKUP_DIR"/civitas_*.dump 2>/dev/null
