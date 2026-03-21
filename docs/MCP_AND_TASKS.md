# CIVITAS — MCP Servers & Recurring Tasks

This document covers the two operational subsystems added to CIVITAS: **MCP servers** for giving Claude structured data access, and **recurring tasks** for background automation (ETL, quality checks, analytics).

---

## Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      Claude Desktop / Claude Code                │
│                                                                  │
│   civitas-db    chicago-data    cook-county    civitas-reports    │
│   (read DB)     (Socrata API)   (Assessor)     (gen reports)     │
│       │              │              │               │            │
│       └──────────────┴──────┬───────┴───────────────┘            │
│                             │ stdio (MCP protocol)               │
└─────────────────────────────┼────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────┐
│                        PostgreSQL                                │
│                                                                  │
│  dim_location  dim_parcel  fact_*  views  task_run  dq_check     │
│                                                                  │
└─────────────────────────────┼────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────┐
│                    Task Scheduler (APScheduler)                   │
│                                                                  │
│  nightly_etl        2 AM daily     │  staleness_check   8 AM    │
│  refresh_scores     3 AM daily     │  quality_audit     Sun 6AM │
│  report_staleness   4 AM daily     │  usage_analytics   Mon 9AM │
└──────────────────────────────────────────────────────────────────┘
```

---

## MCP Servers

Four [Model Context Protocol](https://modelcontextprotocol.io/) servers give Claude structured, read-only access to CIVITAS data. They use **stdio transport** (standard for Claude Desktop) and are configured in `.mcp.json` at the project root.

### Server Summary

| Server | Module | Description | Tools |
|--------|--------|-------------|-------|
| `civitas-db` | `mcp_servers.civitas_db.server` | Read-only access to the Civitas PostgreSQL database | 6 |
| `chicago-data` | `mcp_servers.chicago_data.server` | Live queries against Chicago Data Portal (Socrata SODA2 API) | 4 |
| `cook-county` | `mcp_servers.cook_county.server` | Cook County Assessor parcel and assessment data | 3 |
| `civitas-reports` | `mcp_servers.report_gen.server` | Generate and retrieve CIVITAS property intelligence reports | 4 |

### civitas-db (6 tools)

The primary database server. All queries are read-only (connection pool initialized with `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`).

| Tool | Description |
|------|-------------|
| `query_property(address, pin?)` | Resolve address/PIN to a property using the same tier 1–3 matching as the main app |
| `get_flags(location_sk)` | Get all triggered findings from `view_property_flags` |
| `get_score(location_sk)` | Get activity score and level from `view_property_score` |
| `search_addresses(query, limit?)` | ILIKE address search (limit capped at 100) |
| `get_data_freshness()` | Most recent ingestion timestamp per source dataset |
| `run_sql(query, params?)` | Execute arbitrary read-only SQL (SELECT/WITH only, max 1000 rows) |

### chicago-data (4 tools)

Queries the City of Chicago Data Portal via the Socrata SODA2 API. No local database needed.

| Tool | Description |
|------|-------------|
| `query_dataset(dataset_id, where?, select?, order?, limit?)` | SoQL query against any Chicago dataset (limit capped at 5000) |
| `get_dataset_metadata(dataset_id)` | Dataset metadata (name, columns, last updated) |
| `check_freshness(dataset_id)` | How recently the dataset was updated (age in hours) |
| `count_records(dataset_id, where?)` | Record count with optional SoQL filter |

**Known dataset IDs:** violations=`22u3-xenr`, inspections=`4ijn-s7e5`, permits=`ydr8-5enu`, 311=`v6vf-nfxy`, vacant_buildings=`kc9i-wq85`, tax_annual=`55ju-2fs9`, tax_scavenger=`ydgz-vkrp`

### cook-county (3 tools)

Combines local `dim_parcel` lookups with Cook County Assessor API fallback.

| Tool | Description |
|------|-------------|
| `lookup_parcel_by_pin(pin)` | Look up parcel by 14-digit PIN (local DB first, API fallback) |
| `get_assessment_history(pin)` | Historical assessed values from Cook County Assessor |
| `search_parcels_by_address(address, limit?)` | Search Cook County parcels by address |

### civitas-reports (4 tools)

Generates and retrieves reports. Uses a **read-write** connection pool (writes to `report_audit`).

| Tool | Description |
|------|-------------|
| `generate_report(address, pin?, skip_narrative?)` | Generate a full property intelligence report |
| `get_report(report_id)` | Fetch a previously generated report by UUID |
| `list_reports(limit?, address_filter?)` | List recent reports, optionally filtered by address |
| `download_pdf(report_id)` | Generate PDF and return as base64 |

### Running MCP Servers

**Via Claude Code** (automatic): The `.mcp.json` configuration at the project root is read automatically. Requires Python 3.10+ and the `mcp` package.

**Via Docker:**
```bash
docker compose up -d mcp-civitas-db
```

**Manually:**
```bash
pip install -r requirements-mcp.txt
python3 -m mcp_servers.civitas_db.server
```

### Configuration

MCP servers read from `.env` via `pydantic-settings`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://civitas:civitas@localhost:5432/civitas` | PostgreSQL connection string |
| `SOCRATA_APP_TOKEN` | (empty) | Optional Socrata rate-limit token |
| `MCP_DB_QUERY_TIMEOUT_SECONDS` | `10` | SQL statement timeout |
| `MCP_DB_MAX_QUERY_ROWS` | `1000` | Max rows returned by `run_sql` |

### File Structure

```
mcp_servers/
├── __init__.py
├── common/
│   ├── config.py          # MCPSettings (pydantic-settings)
│   ├── db.py              # asyncpg pool, read-only by default
│   └── socrata.py         # Socrata SODA2 API client
├── civitas_db/
│   └── server.py          # 6 database tools
├── chicago_data/
│   └── server.py          # 4 Socrata API tools
├── cook_county/
│   └── server.py          # 3 parcel/assessment tools
├── report_gen/
│   └── server.py          # 4 report tools
└── tests/
    ├── conftest.py         # FakeConnection, mock_mcp_conn fixture
    ├── test_civitas_db.py  # 7 tests (skipped on Python < 3.10)
    └── test_socrata.py     # 3 tests
```

---

## Recurring Tasks

Six background tasks handle ETL, data quality monitoring, and usage analytics. They run on cron schedules via APScheduler or can be invoked individually from the CLI.

### Task Summary

| Task | Schedule | Description |
|------|----------|-------------|
| `nightly_etl` | `0 2 * * *` (2 AM daily) | Runs all 6 ingestion scripts, refreshes materialized view |
| `refresh_scores` | `0 3 * * *` (3 AM daily) | Refreshes `view_property_summary` materialized view |
| `report_staleness` | `0 4 * * *` (4 AM daily) | Flags reports generated before latest ingestion as stale |
| `staleness_check` | `0 8 * * *` (8 AM daily) | Checks each dataset's freshness against thresholds |
| `quality_audit` | `0 6 * * 0` (Sun 6 AM) | Counts orphaned records, duplicates, and null FKs |
| `usage_analytics` | `0 9 * * 1` (Mon 9 AM) | Aggregates weekly report counts and top addresses |

### Task Details

#### nightly_etl

Runs all six ingestion scripts in sequence:
1. `ingest_violations`
2. `ingest_inspections`
3. `ingest_permits`
4. `ingest_311`
5. `ingest_tax_liens`
6. `ingest_vacant_buildings`

Then refreshes `view_property_summary MATERIALIZED VIEW CONCURRENTLY`. Continues even if individual scripts fail — each script's status is tracked in the result summary.

#### staleness_check

Queries `ingestion_batch` for the most recent `completed_at` per `source_dataset` and compares against configurable thresholds. Datasets with no ingestion records at all are flagged as alerts. Optionally posts alert JSON to a webhook URL.

**Thresholds (hours, configurable via env):**

| Dataset | Env Variable | Default |
|---------|-------------|---------|
| Building violations | `STALENESS_THRESHOLD_VIOLATIONS` | 72h |
| Food inspections | `STALENESS_THRESHOLD_INSPECTIONS` | 72h |
| Building permits | `STALENESS_THRESHOLD_PERMITS` | 72h |
| 311 service requests | `STALENESS_THRESHOLD_311` | 72h |
| Tax liens | `STALENESS_THRESHOLD_TAX_LIENS` | 168h |
| Vacant buildings | `STALENESS_THRESHOLD_VACANT` | 168h |

#### quality_audit

Runs 7 SQL count queries to detect data integrity issues:

| Metric | Query |
|--------|-------|
| `orphaned_tax_liens` | `fact_tax_lien` with no `location_sk` AND no `parcel_sk` |
| `duplicate_locations` | `dim_location` addresses with `COUNT(*) > 1` |
| `null_location_violations` | `fact_violation` with null `location_sk` |
| `null_location_inspections` | `fact_inspection` with null `location_sk` |
| `null_location_permits` | `fact_permit` with null `location_sk` |
| `null_location_311` | `fact_311` with null `location_sk` |
| `unlinked_parcels` | `dim_parcel` with null `location_sk` |

Results are written to `data_quality_check` with `check_type='orphan_audit'`. Non-zero counts trigger `is_alert=TRUE`.

#### usage_analytics

Aggregates weekly metrics:
- `reports_generated` — count of reports from `report_audit` in the last 7 days
- `top_addresses` — top 10 queried addresses with counts

Results are written to the `usage_analytics` table.

### Running Tasks

**CLI — single task:**
```bash
python3 -m tasks.common.runner --task staleness_check
```

**CLI — list all tasks:**
```bash
python3 -m tasks.common.runner --list
```

**Scheduler daemon (APScheduler):**
```bash
python3 -m tasks.common.runner --scheduler
```

**Via start.sh** (if `SCHEDULER_ENABLED=true` in `.env`):
```bash
./start.sh   # scheduler starts automatically in the background
```

**Via Docker:**
```bash
docker compose up -d scheduler
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `false` | Start scheduler with `start.sh` |
| `ALERT_WEBHOOK_URL` | (empty) | POST staleness alerts to this URL |
| `REGENERATE_STALE_REPORTS` | `false` | Reserved for future auto-regeneration |
| `REPORT_STALENESS_WINDOW_DAYS` | `30` | Only flag reports within this window |

### Database Tables

Three tables support task execution logging and quality tracking (defined in `sql/05_tasks_and_quality.sql`):

**`task_run`** — Execution log for every task run
```
run_id (PK), task_name, status (running|completed|failed),
started_at, completed_at, duration_ms, result_summary (JSONB),
error_message, triggered_by (scheduler|cli|api)
```

**`data_quality_check`** — Staleness and quality audit results
```
check_id (PK), check_type, check_date, dataset, metric_name,
metric_value, threshold, is_alert, details (JSONB), task_run_id (FK)
```

**`usage_analytics`** — Weekly usage metrics
```
analytics_id (PK), period_start, period_end, metric_name,
metric_value, details (JSONB), task_run_id (FK)
```

### File Structure

```
tasks/
├── __init__.py
├── common/
│   ├── db.py              # psycopg2 helpers: get_conn, log_task_start/complete/failure
│   ├── registry.py        # register(), get_task(), list_tasks(), _register_all()
│   └── runner.py          # CLI runner + APScheduler daemon
├── nightly_etl.py         # 2 AM — full ETL pipeline
├── staleness_check.py     # 8 AM — data freshness checks
├── quality_audit.py       # Sun 6 AM — orphan/duplicate/null FK audit
├── refresh_scores.py      # 3 AM — materialized view refresh
├── report_staleness.py    # 4 AM — flag stale reports
├── usage_analytics.py     # Mon 9 AM — weekly usage aggregation
└── tests/
    ├── conftest.py              # FakeCursor, FakeConn, mock_task_db fixtures
    ├── test_staleness_check.py  # 5 tests
    ├── test_quality_audit.py    # 3 tests
    ├── test_usage_analytics.py  # 2 tests
    ├── test_runner.py           # 3 tests
    └── test_registry.py         # 3 tests
```

---

## Testing

```bash
# Task tests (16 tests)
python3 -m pytest tasks/tests/ -v

# MCP tests (3 passing + 7 skipped on Python < 3.10)
python3 -m pytest mcp_servers/tests/ -v

# All tests together (backend + tasks + MCP)
python3 -m pytest backend/tests/ tasks/tests/ mcp_servers/tests/ -v
```

**Total test counts:**

| Suite | Tests | Notes |
|-------|-------|-------|
| Backend | 65 | Existing tests, unchanged |
| Tasks | 16 | staleness(5) + quality(3) + analytics(2) + runner(3) + registry(3) |
| MCP | 10 | socrata(3) + civitas_db(7, skipped on Python < 3.10) |
| **Total** | **91** | |

All tests use mock database connections — no running PostgreSQL required.

---

## Requirements

**Tasks** (`requirements-tasks.txt`):
```
apscheduler>=3.10,<4.0
psycopg2-binary==2.9.9
requests==2.32.3
pydantic-settings==2.3.4
usaddress==0.5.10
```

**MCP Servers** (`requirements-mcp.txt`):
```
mcp>=1.0.0
asyncpg==0.29.0
pydantic-settings==2.3.4
requests==2.32.3
```

> **Note:** The `mcp` package requires Python 3.10+. Tasks work on Python 3.8+. The Docker-based path handles both.
