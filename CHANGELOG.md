# Changelog

All notable changes to CIVITAS are documented in this file.

---

## v1.6-map-everywhere (2026-03-21)

**Map on all reports + faster map loading**

- Backend report endpoints enriched with lat/lon/parcel_id via dim_location/dim_parcel JOINs — historical and browsed reports now show the map (#61)
- Map tile layer renders instantly; neighbor markers load asynchronously via separate LayerGroup
- Frontend falls back to report-level geo fields when component props aren't available

## v1.5-product-enhancements (2026-03-21)

**Security hardening, UI polish, expanded test coverage, operational maturity**

- SoQL injection prevention in Socrata proxy endpoints (#60)
- Request logging middleware with UUID request IDs (#60)
- CORS origins configurable via environment variable (#60)
- React Error Boundary for crash recovery (#60)
- Toast notification system (#60)
- PDF preview slide-over panel (#60)
- Keyboard shortcuts overlay (`?` key) (#60)
- Empty state illustrations for zero-data scenarios (#60)
- Dead code cleanup: removed deprecated ScoreGauge, FlagBadge, RiskReport components (#60)
- GitHub Actions CI pipeline — backend, frontend, and lint jobs (#60)
- OpenAPI docs exposed at /docs and /redoc (#60)
- 21 new tests (backend + frontend) (#60)

## v1.5.0 (2026-03-21)

**MCP-powered UI features and Socrata proxy**

- Assessment history panel with Cook County Assessor data (#59)
- Parcel verification component (#59)
- Live record check against Socrata APIs (#59)
- Data health dashboard with freshness monitoring (#59)
- Socrata proxy service for server-side API calls (#59)

**Backup and disaster recovery**

- Database backup/restore scripts (#58)
- Recovery playbook documentation (#58)

**MCP servers and recurring tasks**

- 4 MCP servers: civitas-db, chicago-data, cook-county, civitas-reports (#57)
- 6 recurring tasks: nightly ETL, score refresh, staleness check, quality audit, usage analytics (#57)
- Task runner CLI with APScheduler daemon (#57)

---

## Earlier Releases

### UI Overhaul (2026-03-14 -- 2026-03-20)

- Cross-table address filter on Browse Data page (#56)
- Tax lien formatting fixes, duplicate score tile removal (#55)
- Autocomplete deduplication (#54)
- Summary tab redesign with structured section cards (#53)
- Report generation parallelization, materialized view, caching (#52)
- Dashboard enhancements — welcome hero, stats strip, keyboard shortcut (#51)
- Instant report page loading with async data fill (#50)
- Search page overhaul with Apple design system (#49)
- Timeline slide-over: full record columns (#48), muted color palette (#47), createPortal fix (#46)
- Full Apple-esque UI redesign with design system tokens (#45)
- Compact timeline UI with slide-over detail panel (#44)
- Sticky report header, activity chart, detail table (#43)
- Detail table alongside timeline chart (#42)
- Timeline chart click-to-scroll fix (#41)
- Interactive visual timeline chart (#40)

### Core Features (2026-03-07 -- 2026-03-11)

- Scroll-to-top on route navigation (#39)
- Learn More marketing page (#38)
- Record tab bar cleanup (#37)
- Login/signup split-screen redesign with marketing panel (#36)
- Dashboard polish — search tile removal, logo nav, layout consistency (#35)
- Dashboard inline panels — action cards expand in place (#34)
- Neighbor map, record timeline, async AI summary (#33)
- Decimal JSON serialization fix in rule engine (#32)
- Tax lien re-linkage to canonical dim_location rows (#31)
- Browse Data page with server-side paginated tables (#30)
- Database integrity cleanup, parcel backfill, backup instructions (#29)

### Dashboard and Report Redesign (2026-03-06 -- 2026-03-07)

- Dashboard home page redesign with quick search and stats (#28)
- Report layout redesign with stat strip, section tabs, progressive disclosure (#27)
- Interactive data tables with finding-to-tab linking and CSV export (#26)
- Client/detail toggle removal and report card polish (#25)
- Neutral terminology migration: risk -> activity, flags -> findings (#23, #24)

### Responsive Tables and Batch Analysis (2026-03-02 -- 2026-03-03)

- Responsive table widths (#22)
- Batch/portfolio analysis and report comparison (#21)
- Duplicate address matching fix (#20)
- UUID casting fix in report history (#19)
- Frontend test suite — Vitest + React Testing Library (#18)
- Interactive data tables and auth error messages (#17)
- Municipal Intelligence subtitle rebrand (#16)

### Authentication and Expanded Data (2026-03-01 -- 2026-03-02)

- README and ARCHITECTURE updates (#15)
- Dashboard report refresh and light theme PDF (#14)
- Authentication, account creation, and dashboard (#13)
- Demolition permit flag and vacant building violations (#12)
- Documentation updates (#11)
- 311 service requests in reports and FastAPI deprecation fix (#10)
- Apple-inspired light theme (#9)
- Report history 500 error fix (#8)
- Dark theme PDF reports and test suite (#7)

### MVP (2026-02-28)

- Python 3.8 typing compatibility fix (#6)
- Address autocomplete, property map, report history (#5)
- Dark professional dashboard redesign (#3, #4)
- Report retrieval and full Docker stack (#2)
- **CIVITAS Chicago MVP — full stack implementation** (#1)
  - PostgreSQL + PostGIS database with canonical data model
  - 6-dataset ETL pipeline (violations, inspections, permits, 311, tax liens, vacant buildings)
  - 3-layer SQL rule engine (15 deterministic rules)
  - FastAPI backend with address resolution and report generation
  - Claude AI narrative generation
  - WeasyPrint PDF output
  - React + TypeScript + Vite frontend
