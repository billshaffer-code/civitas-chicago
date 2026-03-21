-- CIVITAS – Task scheduling and data quality tables
-- Phase 1: Foundation infrastructure

CREATE TABLE IF NOT EXISTS task_run (
    run_id          SERIAL PRIMARY KEY,
    task_name       VARCHAR(100) NOT NULL,
    status          VARCHAR(20) DEFAULT 'running',   -- running | completed | failed
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    result_summary  JSONB,
    error_message   TEXT,
    triggered_by    VARCHAR(50) DEFAULT 'scheduler'  -- scheduler | cli | api
);

CREATE TABLE IF NOT EXISTS data_quality_check (
    check_id        SERIAL PRIMARY KEY,
    check_type      VARCHAR(50) NOT NULL,            -- staleness | orphan_audit | duplicate_audit
    check_date      TIMESTAMPTZ DEFAULT NOW(),
    dataset         VARCHAR(100),
    metric_name     VARCHAR(100) NOT NULL,
    metric_value    NUMERIC(14,2),
    threshold       NUMERIC(14,2),
    is_alert        BOOLEAN DEFAULT FALSE,
    details         JSONB,
    task_run_id     INTEGER REFERENCES task_run(run_id)
);

CREATE TABLE IF NOT EXISTS usage_analytics (
    analytics_id    SERIAL PRIMARY KEY,
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    metric_name     VARCHAR(100) NOT NULL,
    metric_value    NUMERIC(14,2),
    details         JSONB,
    task_run_id     INTEGER REFERENCES task_run(run_id)
);

CREATE INDEX IF NOT EXISTS idx_task_run_name ON task_run(task_name);
CREATE INDEX IF NOT EXISTS idx_task_run_started ON task_run(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dqc_type ON data_quality_check(check_type);
CREATE INDEX IF NOT EXISTS idx_dqc_alert ON data_quality_check(is_alert) WHERE is_alert = TRUE;
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_analytics(period_start, period_end);
