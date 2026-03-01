# CIVITAS — Architecture

## Design Philosophy

CIVITAS is built on a single overriding principle: **determinism first**.

All risk logic is expressed in SQL. No risk factor is invented, inferred, or computed outside of the database. Claude receives structured findings as input and produces a human-readable narrative as output — it never scores, never flags, and never overrides the rule engine. This makes every report auditable, reproducible, and explainable without reference to any AI system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                          │
│  Chicago Data Portal (5 CSVs)   Cook County Socrata API      │
└──────────────────────┬──────────────────────────────────────┘
                       │ ETL (Python / psycopg2)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL + PostGIS                     │
│                                                             │
│  dim_location   dim_parcel   ingestion_batch  rule_config   │
│                                                             │
│  fact_violation   fact_inspection   fact_permit             │
│  fact_311         fact_tax_lien                             │
│                                                             │
│  ── SQL Views ──────────────────────────────────────────    │
│  view_property_summary  →  view_property_flags              │
│                         →  view_property_score              │
└──────────────────────┬──────────────────────────────────────┘
                       │ asyncpg
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                                                             │
│  /api/v1/property/lookup    AddressService (4-tier)         │
│  /api/v1/report/generate    RuleEngineService               │
│                             ClaudeAIService                 │
│                             PDFService (WeasyPrint)         │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / proxy
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   React Frontend (Vite)                      │
│                                                             │
│  PropertySearch  →  LookupResult  →  RiskReport             │
│  ScoreGauge   FlagBadge   RecordsTables   PDF download       │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Layer

### Dimension Tables

**`dim_location`** — The canonical address identity record. Every fact table links back here via `location_sk`. Addresses are normalized to a `full_address_standardized` string (e.g., `3500 N HOYNE AVE, CHICAGO IL 60618`) which is the unique key. The table also stores structured components (house number, direction, street name, type, unit, zip) and a PostGIS `GEOMETRY(Point, 4326)` column for geospatial queries.

**`dim_parcel`** — Cook County parcel identity. Links a 14-digit PIN to a `location_sk`. Populated by the building permits ingestion when `PIN_LIST` is present. Used as the preferred lookup key when a caller supplies a PIN.

### Fact Tables

All fact tables are append-only. No record is ever updated or deleted after ingestion.

| Table | Granularity | Key Fields |
|-------|-------------|------------|
| `fact_violation` | One row per violation | violation_date, violation_code, violation_status, inspection_status |
| `fact_inspection` | One row per food inspection | dba_name, facility_type, risk_level, results, violations_text |
| `fact_permit` | One row per permit | permit_type, permit_status, application_start_date, issue_date, processing_time |
| `fact_311` | One row per service request | sr_type, sr_short_code, status, created_date, closed_date |
| `fact_tax_lien` | One row per tax sale event | tax_sale_year, lien_type, sold_at_sale, total_amount_offered |

Every fact table carries `source_dataset` and `ingestion_batch_id` for full provenance tracing.

### Audit & Configuration Tables

**`ingestion_batch`** — Records every ETL run: source dataset, file path, start time, completion time, row count, and status (`running` / `complete` / `failed`).

**`rule_config`** — Parameterizes all 12 risk rules. Each row has a `rule_code`, `category` (A/B/C/D), `description`, `severity_score`, `is_active` flag, and `version`. Deactivating or reweighting a rule requires only an `UPDATE` to this table — no code changes.

**`report_audit`** — Logs every report generation: query address, matched location, match confidence, risk score, risk tier, triggered flags (JSONB), and timestamp.

---

## SQL Rule Engine (3-Layer View Architecture)

### Layer 1 — `view_property_summary`

Aggregates all fact tables per `location_sk` into a single summary row. Key computed fields:

- `active_violation_count` — open violations
- `oldest_open_violation_days` — age of the oldest open violation
- `total_violations` — all-time count
- `violations_prev_year`, `violations_this_year` — for year-over-year comparison
- `failed_inspection_count_24mo` — failed food inspections in the last 24 months
- `avg_permit_processing_days`
- `sr_count_12mo` — 311 service requests in the last 12 months
- `total_lien_events`, `latest_lien_year`, `total_lien_amount`

### Layer 2 — `view_property_flags`

Evaluates each of the 12 rules against `view_property_summary`. Implemented as a `UNION ALL` of 12 SELECT statements — one per rule. Each branch:

- Applies the rule's threshold predicate
- Returns `location_sk`, `flag_code`, and `supporting_count`
- Joins to `rule_config` to attach `category`, `description`, and `severity_score`

Only triggered flags appear in the output. Non-firing rules produce no rows.

### Layer 3 — `view_property_score`

Groups `view_property_flags` by `location_sk`, sums `severity_score` to produce `raw_score`, assigns a `risk_tier` via a `CASE` expression, and aggregates triggered flag codes into an array.

**No application code participates in scoring.** The API reads this view — it does not compute.

---

## ETL Pipeline

### Address Standardization

Every ingestion script runs raw address data through `AddressStandardizer` (in `backend/ingestion/base.py`) before writing to `dim_location`.

Two strategies, in priority order:

1. **Structured columns** — If the CSV provides separate `STREET_NUMBER`, `STREET_DIRECTION`, `STREET_NAME`, `STREET_TYPE` columns, combine them directly. Produces `HIGH` confidence.
2. **Free-form parsing** — If only a raw `ADDRESS` string is present, parse with the `usaddress` library (probabilistic CRF tagger). Produces `HIGH` or `LOW` confidence depending on whether house number and street name are recovered.

Output is a `ParsedAddress` dataclass → `full_address_standardized` string → `upsert_location()`.

### Concurrency-Safe Upsert

`upsert_location()` uses an atomic pattern to handle multiple ETL processes running against the same database:

```sql
INSERT INTO dim_location (...) VALUES (...)
ON CONFLICT (full_address_standardized) DO NOTHING
RETURNING location_sk
```

If the `RETURNING` clause returns nothing (concurrent insert won the race), fall back to a `SELECT`. This avoids deadlocks that arise from the naïve `SELECT`-then-`INSERT` pattern.

### Batch Tracking

Every ETL run uses `BatchTracker` as a context manager:

```
__enter__  → INSERT ingestion_batch (status='running')
__exit__   → UPDATE ingestion_batch (status='failed') on exception
complete() → UPDATE ingestion_batch (status='complete', rows_loaded=N)
```

This provides a full audit trail of every ingestion run.

---

## FastAPI Backend

### Address Resolution Service (`services/address.py`)

Four-tier lookup, returning the first match found:

| Tier | Method | Confidence |
|------|--------|------------|
| 1 | `SELECT parcel_sk FROM dim_parcel WHERE parcel_id = $pin` | EXACT_PIN |
| 2 | `SELECT location_sk FROM dim_location WHERE full_address_standardized = $addr` | EXACT_ADDRESS |
| 3 | `SELECT location_sk FROM dim_location WHERE house_number=$n AND street_name=$s AND zip=$z` | STREET_ZIP |
| 4 | `ORDER BY geom <-> ST_Point($lon,$lat) LIMIT 1` (within 50 m) | GEOSPATIAL |

If no tier matches: `resolved=false`, `match_confidence=NO_MATCH`, warning message returned.

### Rule Engine Service (`services/rule_engine.py`)

Read-only queries against the three SQL views:

- `get_score(location_sk)` → queries `view_property_score`
- `get_flags(location_sk)` → queries `view_property_flags`
- `get_violations/inspections/permits/311_requests/tax_liens(location_sk)` → queries fact tables for supporting records
- `get_data_freshness()` → queries `ingestion_batch` for latest completion timestamp per dataset (violations, inspections, permits, 311, tax liens)

### Claude AI Service (`services/claude_ai.py`)

Builds a structured JSON payload from the rule engine output and sends it to the Anthropic API.

**Model:** `claude-sonnet-4-6`
**Temperature:** 0 (fully deterministic)
**Max tokens:** 800

**System prompt constraints (enforced):**
- Only cite structured findings provided in the input JSON
- Do not speculate, invent records, or provide legal advice
- Do not recommend for or against any transaction
- Use formal, professionally cautious language
- Close every summary with the required legal disclaimer

Claude never sees raw database records — only the pre-structured payload built by the rule engine service.

### PDF Service (`services/pdf.py`)

Uses **WeasyPrint** with a Jinja2 HTML template (`backend/app/templates/report.html`). The full report dict is passed as template context. WeasyPrint renders HTML + CSS to PDF in memory and returns bytes — no temporary files on the hot path.

---

## Frontend

The React frontend is a single-page application with a phase-based state machine:

```
search → lookup-loading → lookup-done → report-loading → report-done
```

**`PropertySearch`** — Address + optional PIN form. Calls `POST /api/v1/property/lookup`.

**Lookup result card** — Shows resolved address, match confidence, optional PIN. On confirmation, calls `POST /api/v1/report/generate`.

**`RiskReport`** — Full report view:
- `ScoreGauge` — circular badge, color-coded by tier (green/yellow/amber/red)
- `PropertyMap` — Leaflet map centered on the property location
- `FlagBadge[]` — one pill per triggered flag, color-coded by category
- AI narrative — rendered as markdown via `react-markdown` + Tailwind Typography
- Five tabbed data tables (violations, inspections, permits, 311 requests, tax liens)
- PDF download — calls `POST /api/v1/report/generate?format=pdf`, triggers browser download

**Theme:** Apple-inspired light design (white/gray cards, blue-600 accents, clean shadows).

Vite's dev-server proxy forwards all `/api` requests to FastAPI on port 8000, so no CORS configuration is needed during development.

### Deployment

Docker Compose runs three services:
- **postgres** — `postgis/postgis:16-3.4` with sql/ mounted to `/docker-entrypoint-initdb.d/` for auto-schema on first boot
- **backend** — `python:3.12-slim` with WeasyPrint system dependencies (libpango, libcairo)
- **frontend** — Multi-stage build (node:20-alpine → nginx:alpine), reverse-proxies `/api/` to backend

---

## Key Design Decisions

**Why SQL views instead of application-layer rules?**
SQL views are the simplest way to guarantee that risk logic is auditable, versionable, and identical regardless of which API server instance handles the request. A rule change is a SQL migration, not a code deployment.

**Why `usaddress` for parsing?**
Chicago addresses follow highly regular conventions but raw data from different city systems uses inconsistent formats. `usaddress` is a probabilistic CRF model trained on US address data that handles the common variations without requiring hand-written regex for every edge case.

**Why asyncpg for the API and psycopg2 for ETL?**
asyncpg is the fastest PostgreSQL driver for Python async workloads (the API is I/O bound). psycopg2 is battle-tested for the synchronous, high-throughput bulk copy patterns used in ETL.

**Why WeasyPrint over a headless browser?**
WeasyPrint produces predictable, high-quality PDFs from HTML/CSS without the overhead and fragility of launching a Chromium instance. It has no network dependencies at render time, making it safe for server-side use.

**Why store the full report JSON?**
The `report_audit` table stores the complete report JSON (as JSONB) alongside key metadata (score, tier, flags). This enables retrieval of previous reports via `GET /api/v1/report/{report_id}` and PDF regeneration from stored data via `GET /api/v1/report/{report_id}/pdf`, providing a full audit trail of all generated reports.

---

## Data Flow: Single Report Request

```
User enters address
        │
        ▼
POST /api/v1/property/lookup
  AddressStandardizer.parse(address)
  4-tier DB lookup
  → LookupResponse {location_sk, match_confidence}
        │
        ▼
POST /api/v1/report/generate
  rule_engine.get_score(location_sk)      ← view_property_score
  rule_engine.get_flags(location_sk)      ← view_property_flags
  rule_engine.get_violations(...)         ← fact_violation
  rule_engine.get_inspections(...)        ← fact_inspection
  rule_engine.get_permits(...)            ← fact_permit
  rule_engine.get_311_requests(...)       ← fact_311
  rule_engine.get_tax_liens(...)         ← fact_tax_lien
  rule_engine.get_data_freshness()        ← ingestion_batch
        │
        ▼
  build_claude_payload(score, flags, records, freshness)
  generate_narrative(payload)             ← Anthropic API
        │
        ▼
  Assemble ReportResponse
  INSERT report_audit
        │
  ┌─────┴──────┐
  │            │
 JSON         PDF
response   WeasyPrint
           → bytes
```

---

## Testing

34 tests in `backend/tests/`, run with `python3 -m pytest tests/ -v`.

| Test File | Count | Coverage |
|-----------|-------|----------|
| `test_address.py` | 8 | PIN normalization, address result building |
| `test_claude_ai.py` | 5 | Payload structure, truncation, Anthropic API call |
| `test_rule_engine.py` | 5 | Score/flags queries, data freshness formatting |
| `test_pdf.py` | 7 | PDF generation, all 4 risk tiers, empty records |
| `test_api_health.py` | 1 | Health endpoint |
| `test_api_property.py` | 3 | Lookup, no-match, autocomplete |
| `test_api_report.py` | 5 | Report generation, retrieval, history |

Tests use `FakeConnection` (mock asyncpg), `httpx.AsyncClient`, and `unittest.mock.AsyncMock`. No running database required.

---

## Scalability Considerations (Future)

- **Horizontal API scaling:** The API is stateless. Multiple FastAPI instances behind a load balancer require only a shared PostgreSQL connection pool.
- **ETL scheduling:** Current scripts are run manually. A simple cron job or Airflow DAG could refresh each dataset on a weekly cadence.
- **Multi-city expansion:** The schema is city-agnostic (`city_id` on `dim_location`). Adding a second city requires new ETL scripts and address standardization tuning — the rule engine and API are unchanged.
- **Portfolio analysis:** The rule engine views accept any `location_sk`. A batch endpoint could accept a list of addresses and return scores for all of them in a single response.
