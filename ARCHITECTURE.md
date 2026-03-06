# CIVITAS — Architecture

## Design Philosophy

CIVITAS is built on a single overriding principle: **determinism first**.

All scoring logic is expressed in SQL. No finding is invented, inferred, or computed outside of the database. Claude receives structured findings as input and produces a human-readable narrative as output — it never scores, never flags, and never overrides the rule engine. This makes every report auditable, reproducible, and explainable without reference to any AI system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                          │
│  Chicago Data Portal (5 CSVs)   Cook County Socrata API      │
│  Chicago Socrata API (vacant buildings)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ ETL (Python / psycopg2)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL + PostGIS                     │
│                                                             │
│  dim_location   dim_parcel   ingestion_batch  rule_config   │
│  users          report_audit                                │
│                                                             │
│  fact_violation   fact_inspection   fact_permit             │
│  fact_311         fact_tax_lien     fact_vacant_building     │
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
│  /api/v1/auth/*               AuthService (JWT + bcrypt)    │
│  /api/v1/property/lookup      AddressService (4-tier)       │
│  /api/v1/report/generate      RuleEngineService             │
│  /api/v1/report/my-reports    ReportService                 │
│  /api/v1/batch/*              ClaudeAIService               │
│                               PDFService (WeasyPrint)       │
│                               get_current_user dependency   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / proxy
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                React Frontend (Vite + React Router)          │
│                                                             │
│  /login → /signup → /dashboard → /search                    │
│  /batch → /compare                                          │
│  AuthContext   ProtectedRoute   AppLayout                   │
│  PropertySearch → LookupResult → PropertyReport             │
│  ActivityBar  FindingCard  RecordsTables  PDF download       │
│  BatchPage (CSV upload + SSE)  ComparePage (side-by-side)   │
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
| `fact_vacant_building` | One row per vacant building violation | docket_number, violation_type, disposition_description, total_fines, current_amount_due |

Every fact table carries `source_dataset` and `ingestion_batch_id` for full provenance tracing.

### User & Audit Tables

**`users`** — User accounts for authentication. Stores email (unique), bcrypt password hash, full name, optional company name, and `is_active` flag. Primary key is `user_id` (UUID, auto-generated).

**`ingestion_batch`** — Records every ETL run: source dataset, file path, start time, completion time, row count, and status (`running` / `complete` / `failed`).

**`rule_config`** — Parameterizes all 15 rules. Each row has a `rule_code`, `category` (A/B/C/D), `description`, `severity_score`, `is_active` flag, and `version`. Categories are mapped to action groups at the presentation layer (A→Review Recommended, B→Worth Noting, C→Informational, D→Action Required). Deactivating or reweighting a rule requires only an `UPDATE` to this table — no code changes.

**`report_audit`** — Logs every report generation: query address, matched location, match confidence, activity score, activity level, triggered findings (JSONB), full report JSON, `user_id` (nullable FK to `users`), and timestamp.

**`batch_job`** / **`batch_job_item`** — Track batch/portfolio analysis jobs. A batch job records the uploaded CSV metadata, status, and user. Each item tracks an individual address within the batch, linking to its `location_sk` and `report_audit` row upon completion.

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
- `has_demolition_permit` — whether a wrecking/demolition permit exists
- `sr_count_12mo` — 311 service requests in the last 12 months
- `total_lien_events`, `latest_lien_year`, `total_lien_amount`
- `active_vacant_building_count`, `vacant_building_fines_due` — vacant building violation metrics

### Layer 2 — `view_property_flags`

Evaluates each of the 15 rules against `view_property_summary`. Implemented as a `UNION ALL` of 15 SELECT statements — one per rule. Each branch:

- Applies the rule's threshold predicate
- Returns `location_sk`, `flag_code`, and `supporting_count`
- Joins to `rule_config` to attach `category`, `description`, and `severity_score`
- Computes `action_group` via a `CASE` on category (A→Review Recommended, B→Worth Noting, C→Informational, D→Action Required)

Only triggered findings appear in the output. Non-firing rules produce no rows.

### Layer 3 — `view_property_score`

Groups `view_property_flags` by `location_sk`, sums `severity_score` to produce `raw_score`, assigns an `activity_level` via a `CASE` expression (QUIET/TYPICAL/ACTIVE/COMPLEX), and aggregates triggered flag codes into an array.

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

### Data Sources by Ingestion Type

| Script | Source | Method |
|--------|--------|--------|
| `ingest_violations` | CSV file | Local file read |
| `ingest_inspections` | CSV file | Local file read |
| `ingest_permits` | CSV file | Local file read |
| `ingest_311` | CSV file | Local file read (13.4M rows, chunked at 10K) |
| `ingest_tax_liens` | Cook County Socrata API | Runtime download |
| `ingest_vacant_buildings` | Chicago Data Portal Socrata API | Runtime download |

---

## FastAPI Backend

### Authentication (`services/auth.py`, `dependencies.py`, `routers/auth.py`)

JWT-based authentication with access and refresh tokens:

- **Registration** — email, password (min 8 chars), full name, optional company. Password hashed with bcrypt via passlib.
- **Login** — returns an access token (30 min expiry) and refresh token (7 day expiry), both signed with HS256.
- **Token refresh** — exchange a valid refresh token for a new token pair.
- **`get_current_user` dependency** — extracts Bearer token from `Authorization` header, decodes JWT, validates type=access, fetches user from database. Returns 401 on failure. Applied to all property and report endpoints.

CORS is restricted to `http://localhost:5173` and `http://localhost:3000` with credentials enabled.

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
- `get_violations/inspections/permits/311_requests/tax_liens/vacant_buildings(location_sk)` → queries fact tables for supporting records
- `get_data_freshness()` → queries `ingestion_batch` for latest completion timestamp per dataset

### Claude AI Service (`services/claude_ai.py`)

Builds a structured JSON payload from the rule engine output and sends it to the Anthropic API.

**Model:** `claude-sonnet-4-6`
**Temperature:** 0 (fully deterministic)
**Max tokens:** 800

**System prompt constraints (enforced):**
- Act as a municipal data analyst, not a risk assessor
- Only cite structured findings provided in the input JSON
- Use neutral, informational language — avoid words like "risk", "danger", "alarming"
- Do not speculate, invent records, or provide legal advice
- Do not recommend for or against any transaction
- Close every summary with the required legal disclaimer

Claude never sees raw database records — only the pre-structured payload built by the rule engine service.

### PDF Service (`services/pdf.py`)

Uses **WeasyPrint** with a Jinja2 HTML template (`backend/app/templates/report.html`). The full report dict is passed as template context. WeasyPrint renders HTML + CSS to PDF in memory and returns bytes — no temporary files on the hot path.

The PDF uses an Apple-inspired light theme matching the frontend: white background, blue-600 accent header, finding cards colored by action group (blue-scale with amber for Action Required), clean gray table borders, and system font stack. A `?view=client` query parameter generates a simplified client-facing version that hides the numeric score.

---

## Frontend

The React frontend uses **React Router** with six routes, all behind authentication:

```
/login → /signup → /dashboard → /search → /batch → /compare
```

### Authentication Layer

**`AuthContext`** — React context providing `user`, `loading`, `login()`, `register()`, `logout()`. On mount, checks for an existing access token in `localStorage` and validates it via `GET /auth/me`. Login stores both tokens in `localStorage`. Logout clears them.

**`ProtectedRoute`** — Wrapper component that shows a spinner while loading, redirects to `/login` if no user, and renders children if authenticated.

**Axios interceptors** — A request interceptor attaches the Bearer token. A response interceptor catches 401 errors, attempts a token refresh with the stored refresh token, and retries the original request. On refresh failure, clears tokens and redirects to `/login`.

### Pages

**`LoginPage`** — Centered card with email/password form, error display, link to signup.

**`SignupPage`** — Registration form (name, email, password, confirm password, optional company) with client-side validation (min 8 chars, match check).

**`DashboardPage`** — Landing page after login. Shows welcome greeting, action cards (Property Search, Portfolio Analysis, Compare Reports), total reports count, recent reports list, and recent batches. Re-fetches on every navigation via `location.key`.

**`SearchPage`** — The full property search and report flow (extracted from the original `App.tsx` state machine):

```
search → lookup-loading → lookup-done → report-loading → report-done
```

**`BatchPage`** — CSV upload for portfolio analysis. Supports drag-and-drop, SSE streaming of processing progress, and a results dashboard with level distribution and sortable results table.

**`ComparePage`** — Side-by-side report comparison. Select two reports from history and view score deltas, finding differences (shared, only-in-A, only-in-B), and AI summary comparison.

**`AppLayout`** — Shared header with CIVITAS branding, Dashboard/Search/Batch/Compare nav links, user name, and Sign Out button. Renders an `<Outlet />` for nested route content.

### Report View Components

**`PropertyReport`** — Full report view with client/detail view toggle:
- `ActivityBar` — horizontal segmented bar with score marker, four labeled segments (QUIET/TYPICAL/ACTIVE/COMPLEX) in blue-scale
- `PropertyMap` — Leaflet map centered on the property location
- `FindingCard[]` — one card per triggered finding, colored by action group (blue-scale with amber for Action Required), grouped by ACTION_ORDER
- AI narrative — rendered as markdown via `react-markdown` + Tailwind Typography
- Six tabbed data tables (violations, inspections, permits, 311 requests, tax liens, vacant buildings)
- Client view hides numeric score, shows clean level badge only
- PDF download — calls `POST /api/v1/report/generate?format=pdf`, triggers browser download

**`ReportComparison`** — Side-by-side diff component showing score deltas (neutral blue), finding differences, record count changes, and AI summary comparison. Used by `ComparePage`.

**Theme:** Apple-inspired light design (white/gray cards, blue-600 accents, clean shadows, `#f5f5f7` background). Blue-scale palette throughout — no red/orange/yellow severity colors.

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

**Why JWT with refresh tokens?**
Short-lived access tokens (30 min) limit exposure if a token is compromised. Refresh tokens (7 days) provide a smooth UX without requiring frequent re-login. The frontend's Axios interceptor handles transparent refresh, so the user never sees token expiration during a session.

**Why localStorage for tokens?**
For this MVP, localStorage provides the simplest cross-tab persistence. The trade-off (XSS vulnerability) is acceptable given that the app doesn't handle third-party content. A production deployment could migrate to httpOnly cookies.

**Why neutral terminology instead of "risk" language?**
CIVITAS is an informational tool, not a risk rating agency. Using alarming terms like "risk score" and "HIGH risk" could create liability exposure and distort how users interpret municipal data. The neutral vocabulary (activity score, findings, QUIET/TYPICAL/ACTIVE/COMPLEX) presents the same deterministic data without implied judgment, letting attorneys and title professionals draw their own conclusions. The underlying SQL rules and scoring weights are unchanged — this is purely a presentation-layer decision.

---

## Data Flow: Single Report Request

```
User enters address (authenticated)
        │
        ▼
POST /api/v1/property/lookup  [Bearer token required]
  get_current_user(token) → validate JWT, fetch user
  AddressStandardizer.parse(address)
  4-tier DB lookup
  → LookupResponse {location_sk, match_confidence}
        │
        ▼
POST /api/v1/report/generate  [Bearer token required]
  get_current_user(token) → validate JWT, fetch user
  rule_engine.get_score(location_sk)      ← view_property_score
  rule_engine.get_flags(location_sk)      ← view_property_flags
  rule_engine.get_violations(...)         ← fact_violation
  rule_engine.get_inspections(...)        ← fact_inspection
  rule_engine.get_permits(...)            ← fact_permit
  rule_engine.get_311_requests(...)       ← fact_311
  rule_engine.get_tax_liens(...)          ← fact_tax_lien
  rule_engine.get_vacant_buildings(...)   ← fact_vacant_building
  rule_engine.get_data_freshness()        ← ingestion_batch
        │
        ▼
  build_claude_payload(score, flags, records, freshness)
  generate_narrative(payload)             ← Anthropic API
        │
        ▼
  Assemble ReportResponse (activity_score, activity_level, findings)
  INSERT report_audit (with user_id)
        │
  ┌─────┴──────┐
  │            │
 JSON         PDF
response   WeasyPrint
           → bytes
```

---

## Testing

126 total tests across backend and frontend.

### Backend (63 tests)

Run with `python3 -m pytest backend/tests/ -v`.

| Test File | Count | Coverage |
|-----------|-------|----------|
| `test_address.py` | 12 | PIN normalization, address result building, tier 2 resolution |
| `test_auth.py` | 14 | Password hashing, JWT encode/decode, register, login, refresh, /me, protected routes |
| `test_claude_ai.py` | 5 | Payload structure (activity_score/level/action_group), truncation, Anthropic API call |
| `test_rule_engine.py` | 5 | Score/flags queries (activity_level), data freshness formatting |
| `test_pdf.py` | 7 | PDF generation, all 4 activity levels (QUIET/TYPICAL/ACTIVE/COMPLEX), empty records |
| `test_report_service.py` | 3 | Report generation, missing location, audit storage |
| `test_batch.py` | 8 | CSV upload, validation, batch retrieval, level distribution |
| `test_api_health.py` | 1 | Health endpoint |
| `test_api_property.py` | 3 | Lookup, no-match, autocomplete |
| `test_api_report.py` | 5 | Report generation, retrieval, history |

### Frontend (63 tests)

Run with `cd frontend && npm run test:run`.

| Test File | Count | Coverage |
|-----------|-------|----------|
| `AuthContext.test.tsx` | 8 | Auth state, login, register, logout |
| `LoginPage.test.tsx` | 6 | Form rendering, auth flow, error handling |
| `SignupPage.test.tsx` | 7 | Registration, validation, error states |
| `DashboardPage.test.tsx` | 6 | Welcome, loading, report cards, navigation |
| `PropertySearch.test.tsx` | 6 | Input, submit, autocomplete, keyboard nav |
| `AppLayout.test.tsx` | 4 | Header, nav, sign out |
| `ProtectedRoute.test.tsx` | 3 | Auth guard, redirect, children rendering |
| `ActivityBar.test.tsx` | 4 | Score display, level label, all activity levels |
| `FindingCard.test.tsx` | 4 | Flag code, action group, border colors, fallback |
| `ScoreGauge.test.tsx` | 4 | Legacy component tests |
| `FlagBadge.test.tsx` | 4 | Legacy component tests |
| `civitas.test.ts` | 7 | API client, auth interceptors |

Tests use `FakeConnection` (mock asyncpg), `httpx.AsyncClient`, `unittest.mock.AsyncMock`, and an autouse `mock_auth` fixture that overrides `get_current_user` for all non-auth tests. No running database required.

---

## Scalability Considerations (Future)

- **Horizontal API scaling:** The API is stateless. Multiple FastAPI instances behind a load balancer require only a shared PostgreSQL connection pool.
- **ETL scheduling:** Current scripts are run manually. A simple cron job or Airflow DAG could refresh each dataset on a weekly cadence.
- **Multi-city expansion:** The schema is city-agnostic (`city_id` on `dim_location`). Adding a second city requires new ETL scripts and address standardization tuning — the rule engine and API are unchanged.
- **Portfolio analysis:** Implemented — CSV upload via `/api/v1/batch/upload` processes up to 100 addresses with SSE progress streaming. Results include per-property activity scores and a portfolio-level summary with level distribution.
- **Production auth hardening:** Migrate tokens to httpOnly cookies, add rate limiting on auth endpoints, add password reset flow, consider OAuth2 for enterprise SSO.
