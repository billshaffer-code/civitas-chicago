#!/usr/bin/env bash
# Full CIVITAS backup — everything not recoverable from GitHub
# Output goes to ~/civitas-backups/YYYYMMDD/ (outside the project tree)
# Usage: bash scripts/backup_full.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TIMESTAMP="$(date +%Y%m%d)"
BACKUP_DIR="$HOME/civitas-backups/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

echo "=== CIVITAS Full Backup ==="
echo "Source:  $PROJECT_DIR"
echo "Target:  $BACKUP_DIR"
echo ""

# 1. Fresh database dump
echo "[1/5] Database dump..."
if docker exec civitas_db pg_isready -U civitas -q 2>/dev/null; then
    docker exec civitas_db pg_dump -U civitas -Fc civitas > "$BACKUP_DIR/civitas_db.dump"
    echo "  OK: $(du -h "$BACKUP_DIR/civitas_db.dump" | cut -f1)"
else
    echo "  SKIP: civitas_db container not running"
fi

# 2. Environment and secrets
echo "[2/5] Environment file..."
if [ -f .env ]; then
    cp .env "$BACKUP_DIR/env.backup"
    echo "  OK: .env copied"
else
    echo "  SKIP: .env not found"
fi

# 3. Chicago source datasets
echo "[3/5] Chicago datasets..."
if [ -d chicago_datasets ]; then
    tar czf "$BACKUP_DIR/chicago_datasets.tar.gz" chicago_datasets/
    echo "  OK: $(du -h "$BACKUP_DIR/chicago_datasets.tar.gz" | cut -f1)"
else
    echo "  SKIP: chicago_datasets/ not found"
fi

# 4. Untracked documents
echo "[4/5] Untracked documents..."
DOCS_COPIED=0
for f in "CIVITAS Marketing Copy.docx"; do
    if [ -f "$f" ]; then
        cp -f "$f" "$BACKUP_DIR/"
        DOCS_COPIED=$((DOCS_COPIED + 1))
    fi
done
echo "  OK: $DOCS_COPIED file(s) copied"

# 5. Generated reports
echo "[5/5] Generated reports..."
if [ -d backend/reports ] && [ "$(ls -A backend/reports 2>/dev/null)" ]; then
    tar czf "$BACKUP_DIR/reports.tar.gz" backend/reports/
    echo "  OK: $(du -h "$BACKUP_DIR/reports.tar.gz" | cut -f1)"
else
    echo "  SKIP: no reports found"
fi

echo ""
echo "=== Backup complete ==="
echo "Location: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
echo ""
echo "Next step: copy $BACKUP_DIR to an external drive or cloud storage."
