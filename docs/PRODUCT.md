# CIVITAS — Product Overview

**Municipal Intelligence for Real Estate Transactions**

---

## What Is CIVITAS?

CIVITAS is a property intelligence platform built for small real estate law firms and title companies operating in the Chicago market. It turns scattered municipal data into clear, actionable property reports — in under 60 seconds.

Before closing on a property, attorneys and title professionals need to know whether it carries unresolved building violations, failed inspections, permit issues, vacant building notices, or tax liens. This information is publicly available but spread across six separate city and county data systems. Pulling it together manually takes hours, requires navigating multiple government portals, and is error-prone.

CIVITAS automates that entire research workflow into a single search.

---

## Who Is It For?

**Small real estate law firms** handling residential and commercial closings in Chicago. CIVITAS gives attorneys a fast, structured way to check a property's municipal history before closing, without replacing formal title examination.

**Title companies** that need to verify property status beyond what appears in the title chain. CIVITAS surfaces building code violations, inspection failures, and tax liens that may not appear in traditional title searches.

**Acquisition teams** evaluating Chicago properties for purchase. CIVITAS provides a standardized, comparable view of municipal activity across properties — useful for due diligence on individual deals or portfolio analysis.

---

## How It Works

### 1. Search a Property

Enter a Chicago street address or Cook County PIN. CIVITAS resolves the property using a four-tier matching system (exact PIN, exact address, street + ZIP, geospatial fallback) and tells you exactly how confident the match is.

### 2. Get an Activity Score

CIVITAS applies 15 deterministic rules against six municipal datasets and produces a transparent activity score:

| Level | Score | What It Means |
|-------|-------|---------------|
| **Quiet** | 0 -- 24 | Minimal municipal activity on record |
| **Typical** | 25 -- 49 | Normal level of municipal interactions |
| **Active** | 50 -- 74 | Above-average municipal activity worth reviewing |
| **Complex** | 75+ | Significant municipal history requiring attention |

Every score is fully explainable. You can see exactly which rules fired, what data triggered them, and how many points each contributed.

### 3. Review Findings

Findings are grouped into four action categories:

- **Action Required** — Active tax liens, aged liens, high-value liens
- **Review Recommended** — Open building violations, aged enforcement actions, demolition permits, vacant building violations
- **Worth Noting** — Repeat compliance issues, above-normal inspection failures
- **Informational** — Permit processing delays, elevated 311 activity, enforcement trends

### 4. Read the AI Summary

Each report includes a plain-language narrative written by Claude AI that explains the findings in professional, legally cautious language. The AI only cites data that appears in the structured report — it never speculates, invents records, or offers legal advice.

### 5. Download or Share

Generate a professionally formatted 3-page PDF report containing the executive summary, detailed data tables, and a methodology appendix. PDFs are suitable for including in transaction files or sharing with clients.

---

## Data Sources

CIVITAS aggregates data from six public municipal datasets:

| Dataset | Source | Records |
|---------|--------|---------|
| Building Violations | Chicago Data Portal | ~2M |
| Food Inspections | Chicago Data Portal | ~306K |
| Building Permits | Chicago Data Portal | ~828K |
| 311 Service Requests | Chicago Data Portal | ~13.4M |
| Tax Liens | Cook County Assessor (Socrata API) | ~206K |
| Vacant Building Violations | Chicago Data Portal (Socrata API) | ~5K |

All data is loaded into a local database via a versioned ETL pipeline. Every report displays data freshness timestamps so you know exactly how current the information is.

---

## Key Capabilities

### Single Property Reports
Search any Chicago address or PIN and get a complete municipal intelligence report in under 60 seconds.

### Portfolio / Batch Analysis
Upload a CSV of up to 100 addresses and process them all at once. Get a portfolio-level summary with activity level distribution and individual property scores.

### Report Comparison
Select any two reports and view them side by side — score deltas, finding differences, and record count changes at a glance.

### Interactive Map
Every report includes a Leaflet map showing the subject property and nearby properties color-coded by their activity level.

### Record Timeline
A chronological feed of all municipal records for a property, with an interactive chart that lets you drill into specific time periods.

### Browse Raw Data
Explore the underlying municipal datasets directly with server-side paginated tables and cross-table address filtering.

### Report History
All reports are saved to your account. Return to any previous report, regenerate its PDF, or use it in a comparison.

---

## What CIVITAS Is Not

CIVITAS is an informational tool. It is not a substitute for formal title examination, and it does not provide legal advice.

- It does not predict future property outcomes
- It does not recommend for or against any transaction
- It does not replace the judgment of a licensed attorney or title professional
- It does not access non-public records or court filings

All output is grounded in structured municipal data, clearly timestamped, and accompanied by a legal disclaimer.

---

## Transparency by Design

Every aspect of CIVITAS scoring is auditable:

- **All 15 rules** are implemented as SQL database views — no scoring logic lives in application code or AI
- **Rule weights** are stored in a configuration table and can be adjusted without code changes
- **Every report** includes the full methodology appendix showing rule definitions, scoring thresholds, and data source descriptions
- **The AI narrative** is constrained by system prompt to cite only the structured data provided — it cannot invent findings or override the rule engine
- **Data provenance** is tracked from source through ingestion to report, with batch IDs and timestamps at every step

---

## Technical Foundation

CIVITAS is a full-stack web application:

- **Database:** PostgreSQL with PostGIS for geospatial queries
- **Backend:** Python FastAPI with JWT authentication
- **Frontend:** React with TypeScript, Tailwind CSS, and Leaflet maps
- **AI:** Anthropic Claude for narrative generation (temperature=0 for determinism)
- **PDF:** WeasyPrint for server-side report rendering
- **CI/CD:** GitHub Actions with automated testing on every push

The system includes 173 automated tests across backend, frontend, and infrastructure, with a CI pipeline that runs on every pull request.

---

## Current Scope

CIVITAS v1 covers **Chicago, Illinois** exclusively. The database schema is designed for multi-city expansion — adding a second city requires new ETL scripts and address standardization tuning, but the rule engine, API, and frontend are city-agnostic.

---

## Contact

For questions about CIVITAS or to request a demo, reach out to the development team via the project repository.
