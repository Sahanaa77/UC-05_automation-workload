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
| **A12** | Fresh-session replay by independent teammate following `SKILL.md` | Skill Documentation | **READY FOR PEER VERIFICATION** | Reproducible workflow documented in [`skills/automation-preview/SKILL.md`](../skills/automation-preview/SKILL.md). Not claimed as executed by agent to ensure audit honesty. |

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
