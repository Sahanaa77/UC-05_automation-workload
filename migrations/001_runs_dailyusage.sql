-- Migration 001: Runs, DailyUsage and Subscriptions tables for UC-05

CREATE TABLE IF NOT EXISTS subscriptions (
    tenant_id VARCHAR(64) PRIMARY KEY,
    plan VARCHAR(16) NOT NULL,    -- 'Basic' | 'Pro'
    status VARCHAR(16) NOT NULL   -- 'Active' | 'Suspended'
);

CREATE TABLE IF NOT EXISTS DailyUsage (
    tenant_id VARCHAR(64) NOT NULL,
    usage_date DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT pk_tenant_DailyUsage PRIMARY KEY (tenant_id, usage_date)
);

CREATE TABLE IF NOT EXISTS Runs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    operation VARCHAR(16) NOT NULL,
    input_fingerprint VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,  -- 'Running' | 'Succeeded' | 'Failed'
    result_json TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_Runs_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_Runs_tenant_created ON Runs(tenant_id, created_at DESC);
