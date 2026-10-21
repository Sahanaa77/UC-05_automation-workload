-- WorkloadLens UC-05: SQL Migration 001
-- Creates Runs and DailyUsage tables for PostgreSQL / Azure SQL

CREATE TABLE IF NOT EXISTS runs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(100),
    idempotency_key VARCHAR(100),
    operation VARCHAR(50),
    input_fingerprint VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'Running',
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_runs_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant_created ON runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_usage (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    utc_date VARCHAR(10) NOT NULL, -- Format: YYYY-MM-DD
    count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_daily_usage_tenant_date UNIQUE (tenant_id, utc_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_lookup ON daily_usage(tenant_id, utc_date);
