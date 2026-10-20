-- untested - verify against the organizer SQL database
-- Migration 001 (T-SQL / Azure SQL): Runs, DailyUsage and Subscriptions tables for UC-05

IF OBJECT_ID('subscriptions', 'U') IS NULL
CREATE TABLE subscriptions (
    tenant_id NVARCHAR(64) NOT NULL PRIMARY KEY,
    plan NVARCHAR(16) NOT NULL,    -- 'Basic' | 'Pro'
    status NVARCHAR(16) NOT NULL   -- 'Active' | 'Suspended'
);

IF OBJECT_ID('DailyUsage', 'U') IS NULL
CREATE TABLE DailyUsage (
    tenant_id NVARCHAR(64) NOT NULL,
    usage_date DATE NOT NULL,
    count INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_tenant_DailyUsage PRIMARY KEY (tenant_id, usage_date)
);

IF OBJECT_ID('Runs', 'U') IS NULL
CREATE TABLE Runs (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    tenant_id NVARCHAR(64) NOT NULL,
    idempotency_key NVARCHAR(128) NOT NULL,
    operation NVARCHAR(16) NOT NULL,
    input_fingerprint NVARCHAR(64) NOT NULL,
    status NVARCHAR(16) NOT NULL,  -- 'Running' | 'Succeeded' | 'Failed'
    result_json NVARCHAR(MAX) NULL,
    error NVARCHAR(MAX) NULL,
    created_at DATETIMEOFFSET NOT NULL,
    finished_at DATETIMEOFFSET NULL,
    CONSTRAINT uq_Runs_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_Runs_tenant_created' AND object_id = OBJECT_ID('Runs'))
CREATE NONCLUSTERED INDEX ix_Runs_tenant_created ON Runs(tenant_id, created_at DESC);
