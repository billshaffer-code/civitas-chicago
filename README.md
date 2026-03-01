# CIVITAS — Municipal & Tax Risk Intelligence

**Chicago v1 | Real Estate Transaction Intelligence**

CIVITAS is a deterministic property risk intelligence system built for small real estate law firms and title companies. Given a Chicago property address or Cook County PIN, it aggregates open municipal data, applies a transparent SQL rule engine, generates a structured risk score, and produces a professionally formatted PDF report — augmented by a Claude AI narrative that explains the findings in plain language.

> **CIVITAS does not provide legal advice and does not replace formal title examination.**
> All output is grounded in structured municipal data and clearly timestamped.

---

## What Problem It Solves

Before closing on a Chicago property, attorneys and title professionals need to know whether the property carries unresolved building violations, failed inspections, permit issues, or tax liens. This information is publicly available but scattered across five separate city and county data sources. Pulling it together manually takes hours and is error-prone.

CIVITAS automates that research into a sub-60-second workflow:

1. Enter an address or PIN
2. Get a deterministic risk score with every triggered flag explained
3. Download a 3-page PDF suitable for a transaction file

---

## Data Sources

| Dataset | Source | Coverage |
|---------|--------|----------|
| Building Violations | Chicago Data Portal | ~2M records |
| Food Inspections | Chicago Data Portal | ~306K records |
| Building Permits | Chicago Data Portal | ~828K records |
| 311 Service Requests | Chicago Data Portal | ~13.4M records |
| Tax Liens (Annual & Scavenger) | Cook County Assessor – Socrata API | ~206K records |

All data is loaded into a local PostgreSQL database via a versioned ETL pipeline. Each ingestion run is recorded in an `ingestion_batch` audit table. Data freshness timestamps are displayed on every report.

---

## Risk Scoring

CIVITAS applies **12 deterministic red-flag rules** across four categories. Every rule is implemented as a SQL view — no risk logic lives in application code or AI.

| Category | Rules | Max Points |
|----------|-------|------------|
| **A — Active Enforcement** | ACTIVE_MUNICIPAL_VIOLATION, AGED_ENFORCEMENT_RISK, SEVERE_ENFORCEMENT_ACTION | 90 |
| **B — Recurring Compliance** | REPEAT_COMPLIANCE_ISSUE, ABOVE_NORMAL_INSPECTION_FAILURE | 35 |
| **C — Regulatory Friction** | PERMIT_PROCESSING_DELAY, ELEVATED_DISTRESS_SIGNALS, ENFORCEMENT_INTENSITY_INCREASE | 35 |
| **D — Tax & Financial** | ACTIVE_TAX_LIEN, AGED_TAX_LIEN, MULTIPLE_LIEN_EVENTS, HIGH_VALUE_LIEN | 130 |

**Risk Tiers**

| Score | Tier |
|-------|------|
| 0 – 24 | LOW |
| 25 – 49 | MODERATE |
| 50 – 74 | ELEVATED |
| 75+ | HIGH |

Scores are additive. Every triggered flag is returned alongside its description, category, severity weight, and supporting record count. Score without explanation is prohibited by design.

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

## Report Output

Each report contains three sections:

**Page 1 — Executive Summary**
- Property address and match confidence
- Risk score and tier (color-coded badge)
- All triggered flags with category, severity score, and supporting count
- Claude AI narrative — professionally worded, cites only structured findings
- Legal disclaimer

**Page 2 — Detailed Findings**
- Building violations table (date, code, status, description, inspection result)
- Food inspections table
- Building permits table
- 311 service requests table (request #, type, code, status, created, closed)
- Tax lien events table

**Page 3 — Methodology Appendix**
- All 12 rule definitions with scoring weights
- Data source descriptions and URLs
- Scoring tier thresholds
- Data freshness timestamps per dataset

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ETL | Python 3.12 + psycopg2 + usaddress |
| API | FastAPI + asyncpg |
| AI Narrative | Anthropic Claude (claude-sonnet-4-6) |
| PDF | WeasyPrint + Jinja2 |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Maps | Leaflet 1.9 |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
civitas/
├── docker-compose.yml         # 3-service stack (postgres, backend, frontend)
├── .env.example
├── sql/
│   ├── 00_schema.sql          # All table DDL
│   ├── 01_indexes.sql         # Performance indexes
│   ├── 02_seed_rules.sql      # 12 rule_config rows
│   └── views/
│       ├── 01_summary.sql     # VIEW_PROPERTY_SUMMARY
│       ├── 02_flags.sql       # VIEW_PROPERTY_FLAGS
│       └── 03_score.sql       # VIEW_PROPERTY_SCORE
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/                   # FastAPI application
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── routers/           # property.py, report.py
│   │   ├── services/          # address.py, rule_engine.py, claude_ai.py, pdf.py
│   │   ├── schemas/           # property.py, report.py
│   │   └── templates/         # report.html, report.css
│   ├── ingestion/             # ETL scripts
│   │   ├── base.py            # BatchTracker, AddressStandardizer
│   │   ├── ingest_violations.py
│   │   ├── ingest_inspections.py
│   │   ├── ingest_permits.py
│   │   ├── ingest_311.py
│   │   └── ingest_tax_liens.py
│   └── tests/                 # 34 tests (pytest + pytest-asyncio)
└── frontend/
    ├── Dockerfile             # Multi-stage: node build → nginx
    ├── nginx.conf             # SPA routing + /api reverse proxy
    └── src/
        ├── App.tsx
        ├── api/civitas.ts
        └── components/
            ├── PropertySearch.tsx
            ├── RiskReport.tsx
            ├── PropertyMap.tsx
            ├── FlagBadge.tsx
            └── ScoreGauge.tsx
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
# Edit .env — set ANTHROPIC_API_KEY
docker-compose up
# Frontend at http://localhost, API at http://localhost:8000
```

### Manual Setup

#### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and ANTHROPIC_API_KEY
```

### 2. Initialize the database

```bash
psql $DATABASE_URL -f sql/00_schema.sql
psql $DATABASE_URL -f sql/01_indexes.sql
psql $DATABASE_URL -f sql/02_seed_rules.sql
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

Tax lien data is fetched automatically from the Cook County Socrata API during ingestion.

### 4. Run ETL

```bash
python -m backend.ingestion.ingest_violations
python -m backend.ingestion.ingest_inspections
python -m backend.ingestion.ingest_permits
python -m backend.ingestion.ingest_311
python -m backend.ingestion.ingest_tax_liens   # downloads from Socrata
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
# Open http://localhost:3000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check + DB connectivity |
| `POST` | `/api/v1/property/lookup` | Resolve address/PIN to location_sk |
| `GET` | `/api/v1/property/autocomplete?q=` | Address autocomplete |
| `POST` | `/api/v1/report/generate` | Generate JSON risk report |
| `POST` | `/api/v1/report/generate?format=pdf` | Generate PDF risk report |
| `GET` | `/api/v1/report/{report_id}` | Retrieve a previous report |
| `GET` | `/api/v1/report/{report_id}/pdf` | Regenerate PDF from stored report |
| `GET` | `/api/v1/report/history?location_sk=` | Report history for a location |

### Property Lookup

```bash
curl -X POST http://localhost:8000/api/v1/property/lookup \
  -H "Content-Type: application/json" \
  -d '{"address": "3500 N HOYNE AVE"}'
```

### Generate Report

```bash
curl -X POST http://localhost:8000/api/v1/report/generate \
  -H "Content-Type: application/json" \
  -d '{"location_sk": 1, "address": "3500 N HOYNE AVE"}'
```

---

## Testing

```bash
cd backend && python3 -m pytest tests/ -v
```

34 tests covering address resolution, rule engine, Claude AI integration, PDF generation, and all API endpoints. Tests use mock database connections and async HTTP clients — no running database required.

---

## Governance & Compliance

- All ingestion runs are versioned in `ingestion_batch`
- No destructive updates — append-only fact tables
- All rule changes are version-controlled in `rule_config`
- Every report includes a data freshness timestamp per dataset
- Every report includes a legal disclaimer
- Claude is constrained by system prompt to cite only provided structured data

---

## Limitations (Chicago v1)

- Chicago properties only
- Address standardization tuned for Chicago street conventions
- Tax lien coverage limited to Cook County Assessor public data
- No real-time data — reflects last ETL run per dataset

---

## License

MIT
