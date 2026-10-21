# WorkloadLens UC-05 — Lifecycle Sequence Diagrams

> **Specification Reference:** Official UC-05 Revision 2 Requirements  
> **Aesthetic Reference:** Contemporary Heritage Architecture Series

---

## 1. Successful Basic-Plan Validation (`A02`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator (Tenant B / Basic)
    participant API as FastAPI Router (/runs)
    participant Auth as Auth & Tenant Dependency
    participant Quota as Quota Engine
    participant DB as SQL Persistence (Runs & DailyUsage)
    participant Blob as BlobStore (Container: data)

    Client->>API: POST /runs {operation: "validate", records: [J01, J02]}<br/>Header: Authorization: Bearer token-tenant-b-operator<br/>Header: Idempotency-Key: b-val-001
    API->>Auth: Resolve Bearer token & verify tenant
    Auth-->>API: TenantContext(tenant_id="tenant-b", role="Operator", plan="Basic", status="Active")
    API->>API: Structural check (2 rows: within 1..10 limit)
    API->>API: Compute SHA-256 fingerprint
    API->>DB: Query existing run for ("tenant-b", "b-val-001")
    DB-->>API: None (new run)
    API->>DB: BEGIN Transaction
    API->>DB: Insert RunModel(status="Running")
    API->>DB: UPDATE DailyUsage SET count = count + 1 WHERE tenant_id="tenant-b" AND count < 3
    DB-->>API: 1 row updated (Quota successfully reserved)
    API->>DB: COMMIT Transaction
    API->>API: Validate records (R1-R4 rules engine) -> valid: 2, invalid: 0
    API->>DB: UPDATE RunModel SET status="Succeeded", result_json=...
    API->>Blob: Put result blob (tenant-b/run_id.json)
    API-->>Client: HTTP 201 Created {run_id: "...", status: "Succeeded", result: {valid_rows: 2, invalid_rows: 0, issues: []}}
```

---

## 2. Successful Pro-Plan Processing (`A04`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator (Tenant A / Pro)
    participant API as FastAPI Router (/runs)
    participant Auth as Auth & Tenant Dependency
    participant Quota as Quota Engine
    participant Engine as Processing Helper
    participant DB as SQL Persistence (Runs & DailyUsage)
    participant Blob as BlobStore (Container: data)

    Client->>API: POST /runs {operation: "process", records: [J01, J02]}<br/>Header: Authorization: Bearer token-tenant-a-operator<br/>Header: Idempotency-Key: a-proc-001
    API->>Auth: Validate identity & role
    Auth-->>API: TenantContext(tenant_id="tenant-a", role="Operator", plan="Pro", status="Active")
    API->>API: Verify plan allows "process" (Pro plan confirmed)
    API->>API: Pre-validate records: valid: 2, invalid: 0 (No invalid rows)
    API->>DB: Atomic reservation: UPDATE DailyUsage count=count+1 WHERE count < 10
    DB-->>API: 1 row updated (Reserved)
    API->>Engine: process([J01 (20 recs), J02 (10 recs)])
    Engine-->>API: Output: J01=200ms, J02=100ms, total=300ms
    API->>DB: UPDATE RunModel SET status="Succeeded", result_json=...
    API->>Blob: Persist result to private storage
    API-->>Client: HTTP 201 Created {run_id: "...", status: "Succeeded", result: {summary: {total_records: 30, total_estimated_ms: 300}, rows: [...]}}
```

---

## 3. Idempotent Replay Lifecycle (`A09`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator
    participant API as FastAPI Router (/runs)
    participant DB as SQL Persistence

    Note over Client,API: Scenario A: Replay with identical payload (Quota exhausted or active)
    Client->>API: POST /runs {operation: "validate", records: [J01, J02]}<br/>Header: Idempotency-Key: existing-key-123
    API->>API: Compute input SHA-256 fingerprint
    API->>DB: Query RunModel by tenant_id & idempotency_key
    DB-->>API: Existing Run (fingerprint MATCHES, status: "Succeeded")
    Note over API: Idempotent replay detected: Zero quota checked or debited
    API-->>Client: HTTP 200 OK {run_id: "orig-run-id", status: "Succeeded", result: {...}}

    Note over Client,API: Scenario B: Replay with altered payload
    Client->>API: POST /runs {operation: "validate", records: [J01 altered]}<br/>Header: Idempotency-Key: existing-key-123
    API->>API: Compute input SHA-256 fingerprint
    API->>DB: Query RunModel by tenant_id & idempotency_key
    DB-->>API: Existing Run (fingerprint DOES NOT MATCH)
    API-->>Client: HTTP 409 Conflict {"detail": "Idempotency key reuse with different input payload"}
```

---

## 4. Invalid Request Rejected Before Quota Acceptance (`A03` / `A05`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator
    participant API as FastAPI Router (/runs)
    participant DB as SQL Persistence

    Client->>API: POST /runs {operation: "process", records: [6 rows containing R1-R4 violations]}<br/>Header: Idempotency-Key: invalid-key-001
    API->>API: Structural & bounds checks pass
    API->>API: Validate input records against rules R1-R4
    Note over API: Detected 4 invalid rows (R1 dup, R2 tool, R3 count, R4 env)
    Note over API: Spec Requirement: operation "process" rejects invalid rows with 400 BEFORE acceptance
    Note over API,DB: Zero database writes, zero quota reserved
    API-->>Client: HTTP 400 Bad Request {detail: {message: "Process operation rejects invalid input rows", valid_rows: 2, invalid_rows: 4, issues: [...]}}
```

---

## 5. Concurrent Requests Competing for the Final Quota Slot (`A08`)

```mermaid
sequenceDiagram
    autonumber
    actor Client1 as Worker Thread 1 (Key: C1)
    actor Client2 as Worker Thread 2 (Key: C2)
    participant API as FastAPI Application
    participant DB as SQL Database (DailyUsage count = 2 / limit = 3)

    par Parallel Submission
        Client1->>API: POST /runs (Tenant B / Key C1)
        Client2->>API: POST /runs (Tenant B / Key C2)
    end

    Note over API,DB: Both requests attempt atomic SQL conditional increment in isolation
    API->>DB: Transaction 1: UPDATE DailyUsage SET count = count + 1 WHERE count < 3
    DB-->>API: 1 row updated (count becomes 3) -> TRANSACTION COMMITTED
    
    API->>DB: Transaction 2: UPDATE DailyUsage SET count = count + 1 WHERE count < 3
    DB-->>API: 0 rows updated (Condition count < 3 failed) -> TRANSACTION ROLLED BACK

    API-->>Client1: HTTP 201 Created (Run Accepted for slot 3/3)
    API-->>Client2: HTTP 429 Too Many Requests {"detail": "Daily quota exhausted for tenant"}
```

---

## 6. Accepted Processing Failure and Replay (`A11`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator
    participant API as FastAPI Router (/runs)
    participant Hook as Failure Injection Hook
    participant DB as SQL Persistence

    Client->>API: POST /runs {operation: "process", records: [J01]}<br/>Header: Idempotency-Key: forced-fail-key<br/>Header: X-Test-Force-Failure: 1
    API->>DB: Reserve quota atomically (Slot consumed)
    API->>DB: Insert RunModel(status="Running")
    API->>Hook: check_failure_hook(request)
    Hook-->>API: Error: "Forced failure via X-Test-Force-Failure header"
    API->>DB: UPDATE RunModel SET status="Failed", error="Forced failure..."
    Note over API,DB: Quota remains consumed (1 slot debited). Status is terminal "Failed".
    API-->>Client: HTTP 201 Created {run_id: "fail-id-123", status: "Failed", error: "Forced failure..."}

    Note over Client,API: Replay with same Idempotency-Key
    Client->>API: POST /runs {operation: "process", records: [J01]}<br/>Header: Idempotency-Key: forced-fail-key
    API->>DB: Query RunModel by ("tenant-a", "forced-fail-key")
    DB-->>API: Existing RunModel(status="Failed", error="Forced failure...")
    Note over API: Replay returns recorded failure without re-executing or debiting quota
    API-->>Client: HTTP 200 OK {run_id: "fail-id-123", status: "Failed", error: "Forced failure..."}
```
