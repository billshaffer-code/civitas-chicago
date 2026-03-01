-- CIVITAS – Users table and report_audit foreign key
-- Run: psql $DATABASE_URL -f sql/03_users.sql

CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name     VARCHAR(200) NOT NULL,
    company_name  VARCHAR(200),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Nullable FK for backward compat with existing report rows
ALTER TABLE report_audit ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_user_id ON report_audit (user_id);
