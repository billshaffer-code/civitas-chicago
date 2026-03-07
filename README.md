# CIVITAS — Municipal Intelligence

**Chicago v1 | Real Estate Transaction Intelligence**

CIVITAS is a deterministic municipal intelligence system built for small real estate law firms and title companies. Given a Chicago property address or Cook County PIN, it aggregates open municipal data, applies a transparent SQL rule engine, generates a structured activity score, and produces a professionally formatted PDF report — augmented by a Claude AI narrative that explains the findings in plain language.

> **CIVITAS does not provide legal advice and does not replace formal title examination.**
> All output is grounded in structured municipal data and clearly timestamped.

---

## What Problem It Solves

Before closing on a Chicago property, attorneys and title professionals need to know whether the property carries unresolved building violations, failed inspections, permit issues, vacant building violations, or tax liens. This information is publicly available but scattered across six separate city and county data sources. Pulling it together manually takes hours and is error-prone.

CIVITAS automates that research into a sub-60-second workflow:

1. Sign in to your account
2. Enter an address or PIN (or upload a CSV for batch analysis)
3. Get a deterministic activity score with every finding explained
4. Toggle between detail and client views; download a 3-page PDF
5. Review past reports from your dashboard or compare reports side-by-side

---

## Data Sources

| Dataset | Source | Coverage |
|---------|--------|----------|
| Building Violations | Chicago Data Portal | ~2M records |
| Food Inspections | Chicago Data Portal | ~306K records |
| Building Permits | Chicago Data Portal | ~828K records |
| 311 Service Requests | Chicago Data Portal | ~13.4M records |
| Tax Liens (Annual & Scavenger) | Cook County Assessor – Socrata API | ~206K records |
| Vacant Building Violations | Chicago Data Portal – Socrata API | ~5K records |

All data is loaded into a local PostgreSQL database via a versioned ETL pipeline. Each ingestion run is recorded in an `ingestion_batch` audit table. Data freshness timestamps are displayed on every report.

---

## Activity Scoring

CIVITAS applies **15 deterministic rules** across four action groups. Every rule is implemented as a SQL view — no scoring logic lives in application code or AI.

| Action Group | Rules | Max Points |
|--------------|-------|------------|
| **Review Recommended** (Cat A) | ACTIVE_MUNICIPAL_VIOLATION, AGED_ENFORCEMENT_RISK, SEVERE_ENFORCEMENT_ACTION, DEMOLITION_PERMIT_ISSUED, VACANT_BUILDING_VIOLATION | 135 |
| **Worth Noting** (Cat B) | REPEAT_COMPLIANCE_ISSUE, ABOVE_NORMAL_INSPECTION_FAILURE | 35 |
| **Informational** (Cat C) | PERMIT_PROCESSING_DELAY, ELEVATED_DISTRESS_SIGNALS, ENFORCEMENT_INTENSITY_INCREASE | 35 |
| **Action Required** (Cat D) | ACTIVE_TAX_LIEN, AGED_TAX_LIEN, MULTIPLE_LIEN_EVENTS, HIGH_VALUE_LIEN, HIGH_VACANT_BUILDING_FINES | 160 |

**Activity Levels**

| Score | Level |
|-------|-------|
| 0 – 24 | QUIET |
| 25 – 49 | TYPICAL |
| 50 – 74 | ACTIVE |
| 75+ | COMPLEX |

Scores are additive. Every triggered finding is returned alongside its description, action group, severity weight, and supporting record count. Score without explanation is prohibited by design.

---

## Address Resolution

Property lookup uses a four-tier matching hierarchy:

1. **Exact PIN match** — Cook County 14-digit parcel ID (preferred)
2. **Exact standardized address match** — canonical `FULL_ADDRESS_STANDARDIZED`
3. **House number + street name + ZIP match**
4. **Geospatial fallback** — nearest point within 50 meters (requires lat/lon)

If no match is found above the confidence threshold, the system returns:
> *"Address match uncertain – manual verification recommended."*

No silent fuzzy matches. Every response includes a `match_confidence` field.

---

## Authentication & Accounts

CIVITAS requires user authentication to access all property and report endpoints.

- **Email/password registration** with bcrypt password hashing
- **JWT tokens** — short-lived access tokens (30 min) + long-lived refresh tokens (7 days)
- **Automatic token refresh** — the frontend transparently refreshes expired access tokens
- **Per-user report history** — each report is linked to the generating user

Public endpoints: health check, register, login, token refresh. All other routes require a Bearer token.

---

## Report Output

Each report contains three sections:

**Page 1 — Executive Summary**
- Property address and match confidence
- Activity score and level (blue-scale badge)
- All findings grouped by action group (Action Required, Review Recommended, Worth Noting, Informational)
- Claude AI narrative — professionally worded, cites only structured findings
- Legal disclaimer

**Page 2 — Detailed Findings**
- Building violations table (date, code, status, description, inspection result)
- Food inspections table
- Building permits table
- 311 service requests table (request #, type, code, status, created, closed)
- Tax lien events table
- Vacant building violations table

**Page 3 — Methodology Appendix**
- All 15 rule definitions with action groups and scoring weights
- Data source descriptions and URLs
- Activity level thresholds
- Data freshness timestamps per dataset

Reports support a **client/detail view toggle**: detail view shows full scoring data, client view presents a cleaner summary suitable for sharing with transaction parties.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ETL | Python 3.12 + psycopg2 + usaddress |
| API | FastAPI + asyncpg |
| Authentication | JWT (python-jose) + bcrypt (passlib) |
| AI Narrative | Anthropic Claude (claude-sonnet-4-6) |
| PDF | WeasyPrint + Jinja2 |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + React Router |
| Maps | Leaflet 1.9 |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
civitas/
├── docker-compose.yml         # 3-service stack (postgres, backend, frontend)
├── .env.example
├── sql/
│   ├── 00_schema.sql          # All table DDL (8 tables)
│   ├── 01_indexes.sql         # Performance indexes
│   ├── 02_seed_rules.sql      # 15 rule_config rows
│   ├── 03_users.sql           # Users table + report_audit FK
│   └── views/
│       ├── 01_summary.sql     # VIEW_PROPERTY_SUMMARY
│       ├── 02_flags.sql       # VIEW_PROPERTY_FLAGS (15 rules)
│       └── 03_score.sql       # VIEW_PROPERTY_SCORE
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/                   # FastAPI application
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py    # JWT auth dependency
│   │   ├── routers/           # auth.py, property.py, report.py, batch.py
│   │   ├── services/          # auth.py, address.py, rule_engine.py, report.py, claude_ai.py, pdf.py
│   │   ├── schemas/           # auth.py, property.py, report.py, batch.py
│   │   └── templates/         # report.html, report.css
│   ├── ingestion/             # ETL scripts
│   │   ├── base.py            # BatchTracker, AddressStandardizer
│   │   ├── ingest_violations.py
│   │   ├── ingest_inspections.py
│   │   ├── ingest_permits.py
│   │   ├── ingest_311.py
│   │   ├── ingest_tax_liens.py
│   │   └── ingest_vacant_buildings.py
│   └── tests/                 # 63 tests (pytest + pytest-asyncio)
└── frontend/
    ├── Dockerfile             # Multi-stage: node build → nginx
    ├── nginx.conf             # SPA routing + /api reverse proxy
    └── src/
        ├── App.tsx            # React Router (BrowserRouter)
        ├── api/civitas.ts     # Axios client + auth interceptors
        ├── context/
        │   └── AuthContext.tsx # User state, login, register, logout
        ├── constants/
        │   └── terminology.ts    # Level/action group configs
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── SignupPage.tsx
        │   ├── DashboardPage.tsx
        │   ├── SearchPage.tsx
        │   ├── BatchPage.tsx     # CSV upload + SSE processing
        │   └── ComparePage.tsx   # Side-by-side report comparison
        └── components/
            ├── ProtectedRoute.tsx
            ├── AppLayout.tsx
            ├── PropertySearch.tsx
            ├── PropertyReport.tsx  # Full report with client/detail toggle
            ├── PropertyMap.tsx
            ├── ActivityBar.tsx     # Horizontal segmented score bar
            ├── FindingCard.tsx     # Action-group colored finding card
            └── ReportComparison.tsx
```

---

## Setup

### Prerequisites

- Docker + Docker Compose (recommended), or:
  - PostgreSQL 16+ with PostGIS
  - Python 3.8+
  - Node.js 18+

### Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and JWT_SECRET_KEY
docker-compose up
# Frontend at http://localhost, API at http://localhost:8000
```

### Manual Setup

#### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, ANTHROPIC_API_KEY, and JWT_SECRET_KEY
```

### 2. Initialize the database

```bash
psql $DATABASE_URL -f sql/00_schema.sql
psql $DATABASE_URL -f sql/01_indexes.sql
psql $DATABASE_URL -f sql/02_seed_rules.sql
psql $DATABASE_URL -f sql/03_users.sql
psql $DATABASE_URL -f sql/04_batch.sql
psql $DATABASE_URL -f sql/views/01_summary.sql
psql $DATABASE_URL -f sql/views/02_flags.sql
psql $DATABASE_URL -f sql/views/03_score.sql
```

### 3. Download and place raw data

Download the following CSV files from the [Chicago Data Portal](https://data.cityofchicago.org) and place them in `chicago_datasets/`:

- `building_violations.csv`
- `food_inspections.csv`
- `building_permits.csv`
- `311.csv`

Tax lien and vacant building data is fetched automatically from Socrata APIs during ingestion.

### 4. Run ETL

```bash
python -m backend.ingestion.ingest_violations
python -m backend.ingestion.ingest_inspections
python -m backend.ingestion.ingest_permits
python -m backend.ingestion.ingest_311
python -m backend.ingestion.ingest_tax_liens           # downloads from Socrata
python -m backend.ingestion.ingest_vacant_buildings     # downloads from Socrata
```

### 5. Start the API

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Quick Start (using backup)

If you have a database backup (e.g., from `backups/`), you can skip steps 2-4 entirely:

```bash
# 1. Start PostgreSQL
docker compose up -d postgres

# 2. Wait for healthy
until docker exec civitas_db pg_isready -U civitas -q; do sleep 1; done

# 3. Restore the backup
docker exec -i civitas_db pg_restore -U civitas -d civitas --clean --if-exists < backups/civitas_20260307.dump

# 4. Start backend + frontend
./start.sh   # or start them individually (steps 5-6 above)
```

### Database Backup & Restore

**Create a backup:**
```bash
docker exec civitas_db pg_dump -U civitas -Fc civitas > backups/civitas_$(date +%Y%m%d).dump
```

**Restore a backup:**
```bash
# Into a running PostgreSQL container (drops and recreates all objects)
docker exec -i civitas_db pg_restore -U civitas -d civitas --clean --if-exists < backups/civitas_20260307.dump
```

**Restore into a fresh database:**
```bash
docker compose up -d postgres
# Wait for healthy, then restore
docker exec -i civitas_db pg_restore -U civitas -d civitas < backups/civitas_20260307.dump
```

Backups use PostgreSQL custom format (`-Fc`), which is compressed and supports selective restore. The backup includes all tables, indexes, views, seed data, and ingested records.

---

## API Reference

### Authentication (public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Create account (201) |
| `POST` | `/api/v1/auth/login` | Authenticate → access + refresh tokens |
| `POST` | `/api/v1/auth/refresh` | Exchange refresh token for new token pair |
| `GET` | `/api/v1/auth/me` | Current user profile (Bearer required) |

### Property & Reports (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check + DB connectivity |
| `POST` | `/api/v1/property/lookup` | Resolve address/PIN to location_sk |
| `GET` | `/api/v1/property/autocomplete?q=` | Address autocomplete |
| `POST` | `/api/v1/report/generate` | Generate JSON report |
| `POST` | `/api/v1/report/generate?format=pdf` | Generate PDF report |
| `GET` | `/api/v1/report/{report_id}` | Retrieve a previous report |
| `GET` | `/api/v1/report/{report_id}/pdf` | Regenerate PDF (`?view=client` for client view) |
| `GET` | `/api/v1/report/history?location_sk=` | Report history for a location (user-scoped) |
| `GET` | `/api/v1/report/my-reports` | All reports for the current user |

### Batch / Portfolio Analysis (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/batch/upload` | Upload CSV of addresses (max 100 rows) |
| `GET` | `/api/v1/batch/{batch_id}/stream` | SSE stream of processing progress |
| `GET` | `/api/v1/batch/{batch_id}` | Retrieve batch results and summary |
| `GET` | `/api/v1/batch/my-batches` | List user's batch jobs |

### Example: Register + Login + Lookup

```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepass123", "full_name": "Jane Smith"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepass123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Property Lookup
curl -X POST http://localhost:8000/api/v1/property/lookup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"address": "3500 N HOYNE AVE"}'

# Generate Report
curl -X POST http://localhost:8000/api/v1/report/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"location_sk": 1, "address": "3500 N HOYNE AVE"}'
```

---

## Testing

```bash
# Backend (63 tests)
cd /path/to/Civitas && python3 -m pytest backend/tests/ -v

# Frontend (63 tests)
cd /path/to/Civitas/frontend && npm run test:run
```

**126 total tests** across backend and frontend. Backend tests cover authentication, address resolution, rule engine, Claude AI integration, PDF generation, batch processing, report service, and all API endpoints. Frontend tests cover auth context, all pages, and all components. Tests use mock database connections, async HTTP clients, and autouse auth fixtures — no running database required.

---

## Governance & Compliance

- All ingestion runs are versioned in `ingestion_batch`
- No destructive updates — append-only fact tables
- All rule changes are version-controlled in `rule_config`
- Every report includes a data freshness timestamp per dataset
- Every report includes a legal disclaimer
- Claude is constrained by system prompt to cite only provided structured data
- All API access is authenticated; reports are linked to user accounts

---

## Limitations (Chicago v1)

- Chicago properties only
- Address standardization tuned for Chicago street conventions
- Tax lien coverage limited to Cook County Assessor public data
- No real-time data — reflects last ETL run per dataset

---

## License

MIT
