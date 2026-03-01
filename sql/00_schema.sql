-- CIVITAS Chicago v1 -- Full Schema DDL
-- Run order: 00_schema.sql → 01_indexes.sql → 02_seed_rules.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Supporting Tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_batch (
    ingestion_batch_id SERIAL PRIMARY KEY,
    source_dataset     VARCHAR(100) NOT NULL,
    file_path          TEXT,
    rows_loaded        INTEGER,
    started_at         TIMESTAMPTZ DEFAULT NOW(),
    completed_at       TIMESTAMPTZ,
    status             VARCHAR(20)  DEFAULT 'running'  -- running | complete | failed
);

CREATE TABLE IF NOT EXISTS rule_config (
    rule_code      VARCHAR(50) PRIMARY KEY,
    category       CHAR(1)     NOT NULL,              -- A | B | C | D
    description    TEXT,
    severity_score INTEGER     NOT NULL,
    is_active      BOOLEAN     DEFAULT TRUE,
    version        INTEGER     DEFAULT 1,
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Dimension Tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dim_location (
    location_sk               SERIAL PRIMARY KEY,
    full_address_standardized VARCHAR(500) NOT NULL UNIQUE,
    house_number              VARCHAR(20),
    street_direction          VARCHAR(5),
    street_name               VARCHAR(200),
    street_type               VARCHAR(50),
    unit                      VARCHAR(50),
    zip                       VARCHAR(10),
    lat                       DOUBLE PRECISION,
    lon                       DOUBLE PRECISION,
    geom                      GEOMETRY(Point, 4326),
    source_address_raw        TEXT,
    city_id                   INTEGER DEFAULT 1,
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_parcel (
    parcel_sk      SERIAL PRIMARY KEY,
    parcel_id      VARCHAR(20) NOT NULL UNIQUE,       -- PIN (normalized, no dashes/spaces)
    location_sk    INTEGER REFERENCES dim_location(location_sk),
    property_class VARCHAR(10),
    lot_size       NUMERIC(12, 2),
    assessed_value NUMERIC(14, 2),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Fact Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fact_violation (
    violation_sk            SERIAL PRIMARY KEY,
    location_sk             INTEGER REFERENCES dim_location(location_sk),
    source_id               VARCHAR(50),
    violation_date          DATE,
    violation_last_modified DATE,
    violation_code          VARCHAR(20),
    violation_status        VARCHAR(20),              -- OPEN | COMPLIED | NO ENTRY
    violation_status_date   DATE,
    violation_description   TEXT,
    violation_ordinance     TEXT,
    inspector_comments      TEXT,
    inspection_number       VARCHAR(20),
    inspection_status       VARCHAR(20),              -- OPEN | CLOSED | FAILED
    inspection_category     VARCHAR(50),
    department_bureau       VARCHAR(100),
    source_dataset          VARCHAR(100) DEFAULT 'building_violations',
    ingestion_batch_id      INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_inspection (
    inspection_sk      SERIAL PRIMARY KEY,
    location_sk        INTEGER REFERENCES dim_location(location_sk),
    source_id          VARCHAR(50),
    dba_name           VARCHAR(200),
    facility_type      VARCHAR(100),
    risk_level         VARCHAR(20),
    inspection_date    DATE,
    inspection_type    VARCHAR(100),
    results            VARCHAR(30),                   -- Pass | Fail | Pass w/ Conditions
    violations_text    TEXT,
    source_dataset     VARCHAR(100) DEFAULT 'food_inspections',
    ingestion_batch_id INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_permit (
    permit_sk              SERIAL PRIMARY KEY,
    location_sk            INTEGER REFERENCES dim_location(location_sk),
    parcel_sk              INTEGER REFERENCES dim_parcel(parcel_sk),
    source_id              VARCHAR(50),
    permit_number          VARCHAR(50),
    permit_status          VARCHAR(50),
    permit_type            VARCHAR(100),
    application_start_date DATE,
    issue_date             DATE,
    processing_time        INTEGER,                   -- days
    total_fee              NUMERIC(12, 2),
    work_description       TEXT,
    source_dataset         VARCHAR(100) DEFAULT 'building_permits',
    ingestion_batch_id     INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_311 (
    sr_sk              SERIAL PRIMARY KEY,
    location_sk        INTEGER REFERENCES dim_location(location_sk),
    source_id          VARCHAR(50),                   -- SR_NUMBER
    sr_type            VARCHAR(200),
    sr_short_code      VARCHAR(20),
    status             VARCHAR(50),
    created_date       TIMESTAMPTZ,
    closed_date        TIMESTAMPTZ,
    source_dataset     VARCHAR(100) DEFAULT '311_service_requests',
    ingestion_batch_id INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_tax_lien (
    lien_sk                  SERIAL PRIMARY KEY,
    parcel_sk                INTEGER REFERENCES dim_parcel(parcel_sk),
    location_sk              INTEGER REFERENCES dim_location(location_sk),
    source_id                VARCHAR(50),
    tax_sale_year            INTEGER,
    lien_type                VARCHAR(20),              -- ANNUAL | SCAVENGER
    from_year                INTEGER,
    to_year                  INTEGER,
    sold_at_sale             BOOLEAN,
    tax_amount_offered       NUMERIC(14, 2),
    penalty_amount_offered   NUMERIC(14, 2),
    total_amount_offered     NUMERIC(14, 2),
    total_amount_forfeited   NUMERIC(14, 2),
    buyer_name               VARCHAR(200),
    source_dataset           VARCHAR(100),
    ingestion_batch_id       INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_vacant_building (
    vacant_building_sk      SERIAL PRIMARY KEY,
    location_sk             INTEGER REFERENCES dim_location(location_sk),
    source_id               VARCHAR(50),
    docket_number           VARCHAR(50),
    violation_number        VARCHAR(50),
    issued_date             DATE,
    last_hearing_date       DATE,
    violation_type          VARCHAR(200),
    entity_or_person        VARCHAR(300),
    disposition_description TEXT,
    total_fines             NUMERIC(14, 2),
    current_amount_due      NUMERIC(14, 2),
    total_paid              NUMERIC(14, 2),
    source_dataset          VARCHAR(100) DEFAULT 'vacant_building_violations',
    ingestion_batch_id      INTEGER REFERENCES ingestion_batch(ingestion_batch_id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Report Audit ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_audit (
    report_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_address    TEXT NOT NULL,
    location_sk      INTEGER REFERENCES dim_location(location_sk),
    match_confidence VARCHAR(30),
    risk_score       INTEGER,
    risk_tier        VARCHAR(20),
    flags_json       JSONB,
    report_json      JSONB,
    generated_at     TIMESTAMPTZ DEFAULT NOW(),
    pdf_path         TEXT
);
