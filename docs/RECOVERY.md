# CIVITAS Disaster Recovery Playbook

Step-by-step guide to restore a working CIVITAS environment from scratch.

## Prerequisites

- Ubuntu/WSL2 with Docker installed
- A CIVITAS backup directory (from `scripts/backup_full.sh`) or access to GitHub
- Node.js 18+ and Python 3.12+

## Recovery Steps

### 1. Clone the Repository

```bash
git clone git@github.com:billshaffer-code/Civitas.git
cd Civitas
```

### 2. Restore the `.env` File

Copy from backup:

```bash
cp /path/to/backup/env.backup .env
```

Or recreate manually with these required values:

```
DATABASE_URL=postgresql://civitas:civitas@localhost:5432/civitas
ANTHROPIC_API_KEY=<regenerate at console.anthropic.com>
SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
# Wait for healthy status
docker ps --filter name=civitas_db
```

### 4. Restore the Database

**From a backup dump (preferred — fastest):**

```bash
docker exec -i civitas_db pg_restore -U civitas -d civitas --clean --if-exists < /path/to/backup/civitas_db.dump
```

**From scratch (no backup available):**

```bash
# Apply schema and seed data
psql $DATABASE_URL -f sql/00_schema.sql
psql $DATABASE_URL -f sql/01_seed.sql
psql $DATABASE_URL -f sql/02_rules.sql
psql $DATABASE_URL -f sql/03_views.sql
psql $DATABASE_URL -f sql/04_scoring.sql

# Restore Chicago datasets (re-download if needed)
# Source: https://data.cityofchicago.org/
# Then run ETL:
python3 -m backend.etl.load_violations
python3 -m backend.etl.load_inspections
python3 -m backend.etl.load_permits
python3 -m backend.etl.load_311
python3 -m backend.etl.load_tax_liens
```

### 5. Install Dependencies

```bash
# Backend
pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 6. Start Services

```bash
./start.sh
# Or manually:
python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000 &
cd frontend && npm run dev &
```

### 7. Verify

```bash
# Health check
curl http://localhost:8000/api/v1/health

# Run tests
python3 -m pytest backend/tests/ -v
cd frontend && npm run test:run

# Generate a test report to confirm end-to-end
# Visit http://localhost:3000 and search for a known address
```

## Restore Chicago Datasets (if needed)

If `chicago_datasets/` was not backed up, re-download from the Chicago Data Portal:

| Dataset | Portal URL |
|---------|-----------|
| Building Violations | https://data.cityofchicago.org/Buildings/Building-Violations/22u3-xenr |
| Inspections | https://data.cityofchicago.org/Buildings/Building-Inspections/me59-5fac |
| Building Permits | https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu |
| 311 Service Requests | https://data.cityofchicago.org/Service-Requests/311-Service-Requests/v6vf-nfxy |
| Tax Liens | Cook County Clerk / property tax portal |

Export as CSV and place in `chicago_datasets/`.

## Recovery Time Estimates

| Method | Time |
|--------|------|
| Full restore from backup dump | ~10 minutes |
| Schema + full ETL from CSVs | ~2 hours |
| Re-download datasets + ETL | ~2.5 hours |

## Notes

- The Docker volume `civitas_pgdata` stores the live database. If only the volume is lost (not the whole machine), restore from the dump file.
- User accounts and generated reports are stored in the database — they are included in the dump.
- The `backups/` directory is gitignored. Always keep at least one copy off-machine.
