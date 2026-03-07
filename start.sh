#!/usr/bin/env bash
# Start CIVITAS — PostgreSQL, backend API, and frontend dev server
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Load environment
if [ -f .env ]; then
  set -a; source .env; set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://civitas:civitas@localhost:5432/civitas}"

# ── 1. PostgreSQL (Docker) ──────────────────────────────────────────
echo "Starting PostgreSQL..."
docker compose up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker exec civitas_db pg_isready -U civitas -q 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# ── 2. Apply schema & views ─────────────────────────────────────────
echo "Applying SQL schema and views..."
psql "$DATABASE_URL" -f sql/00_schema.sql -q
psql "$DATABASE_URL" -f sql/01_indexes.sql -q
psql "$DATABASE_URL" -f sql/02_seed_rules.sql -q
psql "$DATABASE_URL" -f sql/03_users.sql -q
psql "$DATABASE_URL" -f sql/04_batch.sql -q
psql "$DATABASE_URL" -f sql/views/01_summary.sql -q
psql "$DATABASE_URL" -f sql/views/02_flags.sql -q
psql "$DATABASE_URL" -f sql/views/03_score.sql -q
echo "Schema applied."

# ── 3. Backend API ──────────────────────────────────────────────────
echo "Starting backend on :8000..."
python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# ── 4. Frontend dev server ──────────────────────────────────────────
echo "Starting frontend on :5173..."
cd "$PROJECT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!
cd "$PROJECT_DIR"

echo ""
echo "CIVITAS is running:"
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM
wait
