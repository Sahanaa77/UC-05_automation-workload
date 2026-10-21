# WorkloadLens UC-05 — Acceptance Evidence & Verification Log

> **Use Case ID:** UC-05 | **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Team:** Code Sapiens | **Revision:** 2  
> **Verification Timestamp:** `2026-10-21T12:16:00Z` (Local: `2026-10-21 17:46:00 +05:30`)  
> **Live Target:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`  
> **Container Image:** `uc05registry7bef65da.azurecr.io/workloadlens:befe0dc0d00fdc4c5a71807d5faafe56228e48fc`

---

## 1. Acceptance Checks Matrix (A01–A12)

| Check | Requirement Summary | Verification Scope | Status | Verified Evidence & Observed Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **A01** | Public `/health` 200 OK, 2 Terraform resources, repeat plan 0 changes | Live Cloud + Terraform | **PASS** | `GET /health` -> `HTTP 200 OK` (`{"status":"ok"}`). Terraform manages exactly 2 resources (`azurerm_container_app.api`, `azurerm_storage_container.data`). Repeat plan shows 0 drift. |
| **A02** | Valid fixture (J01, J02) -> 2 valid, 0 invalid, 0 issues | Live Cloud + Pytest | **PASS** | `POST /runs` (`operation: validate`, 2 rows) -> `HTTP 201 Created`, `valid_rows: 2`, `invalid_rows: 0`, `issues: []`. |
| **A03** | Invalid fixture (6 rows) -> 2 valid, 4 invalid, R1–R4 failures | Live Cloud + Pytest | **PASS** | `POST /runs` (`operation: validate`, 6 rows) -> `HTTP 201 Created`, `valid_rows: 2`, `invalid_rows: 4`, issues contain all four rules `{"R1", "R2", "R3", "R4"}`. |
| **A04** | Pro `process` exact outputs (J01=200ms, J02=100ms, total=300ms) | Live Cloud + Pytest | **PASS** | `POST /runs` (`operation: process`, 2 rows) -> `HTTP 201 Created`, `summary: {input_rows: 2, total_records: 30, total_estimated_ms: 300}`, `rows: [{record_id: "J01", estimated_ms: 200}, {record_id: "J02", estimated_ms: 100}]`. Result retrievable via `GET /runs/{id}/result`. |
| **A05** | Invalid process, wrong body shape, 11-row batch return 400, 0 quota | Live Cloud + Pytest | **PASS** | `POST /runs` (`operation: process` with invalid row) -> `HTTP 400 Bad Request` (`Process operation rejects invalid input rows`). Zero runs created, zero quota consumed. |
| **A06** | Unauthenticated 401; Viewer submit & Basic process 403, 0 quota | Live Cloud + Pytest | **PASS** | Unauthenticated protected request -> `HTTP 401`. Viewer submitting -> `HTTP 403`. Basic plan submitting `process` -> `HTTP 403`. Quota unchanged. |
| **A07** | Cross-tenant isolation; Tenant B cannot list/get Tenant A run; 404 | Live Cloud + Pytest | **PASS** | Tenant A creates run -> Tenant B `GET /runs` does NOT contain run (`leaked: False`). Tenant B `GET /runs/{run_id}/result` returns `HTTP 404 Not Found`. `X-Tenant-Override` header rejected with 400. |
| **A08** | Basic accepts 3 runs/day, rejects 4th with 429; atomic race condition | Local Pytest | **PASS** | `test_uc05_acceptance.py::test_a08_basic_quota_and_concurrency` and `test_runs_flow.py::test_basic_3_accepted_then_429`. Under multithreaded competition for final slot, exactly 1 succeeds (201) and others receive 429. |
| **A09** | Idempotent replay returns same run with 200 OK, 0 debit; changed key 409 | Live Cloud + Pytest | **PASS** | Replay with identical key & payload -> `HTTP 200 OK`, returns identical `run_id` without debiting quota. Replay with changed payload -> `HTTP 409 Conflict`. |
| **A10** | Suspended subscription rejects new runs with 403; reads remain 200 | Live Cloud + Pytest | **PASS** | `token-tenant-suspended-operator` `POST /runs` -> `HTTP 403 Forbidden`. `GET /runs` -> `HTTP 200 OK` (historical read permitted). |
| **A11** | Processing failure hook records Failed status, 1 slot used, replay returns Failed | Local Pytest | **PASS** | `test_uc05_acceptance.py::test_a11_forced_failure_hook` and `test_runs_flow.py::test_forced_failure_lifecycle`. Terminal `status: "Failed"`, error saved, quota debited. |
| **A12** | Fresh-session independent evaluation via `skills/automation-preview/SKILL.md` | Live Cloud + Skill Verification | **PASS** | Evaluated against deployed API (`workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`). Smoke `/health` returned 200 `{"status":"ok"}`; Procedure A returned 201 (`valid_rows: 2`, `invalid_rows: 0`) and process returned 201 (J01: 200ms, J02: 100ms, total: 300ms); Procedure B returned 201 (`valid_rows: 2`, `invalid_rows: 4`, R1–R4 detected); invalid process rejected with 400 (`Process operation rejects invalid input rows`); idempotent replay returned 200 with identical run ID; Procedure C forced failure verified under `TEST_MODE=1` in test harness while cloud safely enforces `TEST_MODE=0`. |

---

## 2. Test Suite Execution Logs

### Automated Backend Tests (63 Passed)
```
platform win32 -- Python 3.14.6, pytest-9.1.1
collected 63 items

backend/tests/test_auth_and_harness.py ........                         [ 12%]
backend/tests/test_blob_store.py ..                                      [ 15%]
backend/tests/test_edge.py ...............                              [ 39%]
backend/tests/test_health.py ...                                        [ 44%]
backend/tests/test_read_routes.py ......                                [ 53%]
backend/tests/test_runs_flow.py .............                           [ 74%]
backend/tests/test_uc05_acceptance.py ...........                        [ 92%]
backend/tests/test_validation.py .....                                  [100%]

======================== 63 passed, 1 warning in 9.40s ========================
```

### Frontend Production Build
```
> workloadlens@0.1.0 build
> tsc -b && vite build

vite v6.4.4 building for production...
✓ 2231 modules transformed.
dist/index.html                   1.83 kB │ gzip:   0.82 kB
dist/assets/index-OceBhv3C.css   71.13 kB │ gzip:  11.33 kB
dist/assets/index-Bt0vUMxo.js   863.07 kB │ gzip: 240.38 kB
✓ built in 14.65s
```

### Terraform Configuration Validation
```
Success! The configuration is valid.
```

---

## 3. Fresh-Session Live Evaluation Logs (A12)

*Evaluated against deployed endpoint: `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`*

### 1. Health Probe Check
```http
GET /health
HTTP/1.1 200 OK
Content-Length: 15
Content-Type: application/json
Server: uvicorn

{"status":"ok"}
```

### 2. Procedure A — Valid Fixture Validation (2 rows: J01, J02)
```http
POST /runs (operation: "validate", Idempotency-Key: a12-live-valid-003)
HTTP/1.1 201 Created
Content-Length: 246
Content-Type: application/json
Server: uvicorn

{"run_id":"7e24656a-a7d9-4b0a-b8cb-975ed9ff970e","status":"Succeeded","operation":"validate","result":{"valid_rows":2,"invalid_rows":0,"issues":[]},"error":null,"created_at":"2026-10-21T19:18:05.118255","finished_at":"2026-10-21T19:18:05.123661"}
```

### 3. Procedure A — Valid Fixture Workload Processing & Estimate Output
```http
POST /runs (operation: "process", Idempotency-Key: a12-live-proc-001)
HTTP/1.1 201 Created
Content-Length: 371
Content-Type: application/json
Server: uvicorn

{"run_id":"83a07117-6d76-4c29-86d7-714f08a9b536","status":"Succeeded","operation":"process","result":{"summary":{"input_rows":2,"total_records":30,"total_estimated_ms":300},"rows":[{"record_id":"J01","estimated_ms":200},{"record_id":"J02","estimated_ms":100}],"issues":[]},"error":null,"created_at":"2026-10-21T19:19:38.438707","finished_at":"2026-10-21T19:19:38.443843"}
```

### 4. Procedure B — Invalid Fixture Validation (6 rows, R1–R4 violation check)
```http
POST /runs (operation: "validate", Idempotency-Key: a12-live-invalid-001)
HTTP/1.1 201 Created
Content-Length: 449
Content-Type: application/json
Server: uvicorn

{"run_id":"ccad8643-113b-497d-8007-e1d0069628f5","status":"Succeeded","operation":"validate","result":{"valid_rows":2,"invalid_rows":4,"issues":[{"row_index":3,"field":"record_id","rule_id":"R1"},{"row_index":4,"field":"tool","rule_id":"R2"},{"row_index":5,"field":"record_count","rule_id":"R3"},{"row_index":6,"field":"environment","rule_id":"R4"}]},"error":null,"created_at":"2026-10-21T19:18:22.486290","finished_at":"2026-10-21T19:18:22.491320"}
```

### 5. Invalid Process Request Rejection (A05)
```http
POST /runs (operation: "process" with invalid tool "DELETE")
HTTP/1.1 400 Bad Request
Content-Length: 158
Content-Type: application/json
Server: uvicorn

{"detail":{"message":"Process operation rejects invalid input rows","valid_rows":1,"invalid_rows":1,"issues":[{"row_index":2,"field":"tool","rule_id":"R2"}]}}
```

### 6. Idempotency Replay Verification (A09 / A12)
```http
POST /runs (replaying identical payload with Idempotency-Key: a12-live-valid-003)
HTTP/1.1 200 OK
Content-Length: 246
Content-Type: application/json
Server: uvicorn

{"run_id":"7e24656a-a7d9-4b0a-b8cb-975ed9ff970e","status":"Succeeded","operation":"validate","result":{"valid_rows":2,"invalid_rows":0,"issues":[]},"error":null,"created_at":"2026-10-21T19:18:05.118255","finished_at":"2026-10-21T19:18:05.123661"}
```
