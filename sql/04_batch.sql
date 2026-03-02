-- CIVITAS – Batch/Portfolio analysis tables
-- Run after 00_schema.sql

CREATE TABLE IF NOT EXISTS batch_job (
    batch_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(user_id),
    batch_name      VARCHAR(200),
    total_count     INTEGER NOT NULL,
    completed_count INTEGER DEFAULT 0,
    failed_count    INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'pending',  -- pending|processing|completed|failed
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS batch_job_item (
    item_id         SERIAL PRIMARY KEY,
    batch_id        UUID REFERENCES batch_job(batch_id) ON DELETE CASCADE,
    row_index       INTEGER NOT NULL,
    input_address   TEXT NOT NULL,
    location_sk     INTEGER REFERENCES dim_location(location_sk),
    report_id       UUID REFERENCES report_audit(report_id),
    status          VARCHAR(20) DEFAULT 'pending',  -- pending|processing|completed|failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_job_user ON batch_job(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_job_item_batch ON batch_job_item(batch_id);
