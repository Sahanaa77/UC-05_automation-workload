# WorkloadLens UC-05 — Comprehensive Security Review, Audit & Handover Report

> **Project:** WorkloadLens — Automation Workload Preview SaaS  
> **Use Case ID:** UC-05 | **Team:** Code Sapiens | **Revision:** 2  
> **Evaluation Date:** October 21, 2026  
> **Evaluator Role:** Senior DevOps Engineer, Cloud Architect, Backend Auditor & QA Specialist  
> **Branch:** `feature/uc05-infra-docs` | **Target Environment:** Azure Container Apps (`rg-uc05-demo`)

---

## 1. Executive Security & Architectural Review

This report presents an evidence-driven audit of **WorkloadLens**, evaluating the implementation directly against the official competition specification (`UC-05_automation-workload.docx`, Revision 2).

### 1.1 Resolution of Pytest vs Script Exit Code Clarification
- An earlier shell one-liner executing inline Python reflection (`python -c "from entitlesim.main import app; for r in app.routes: print(r.methods)"`) raised `AttributeError: 'Mount' object has no attribute 'methods'` and exited with code 1.
- The actual pytest test suite was executed in full: **33 passed, 0 failed, 1 warning in 7.91s (exit code 0)**. There are zero failing tests and no weakened assertions.

### 1.2 Route Contract Verification
The six required routes are registered at their exact specification paths:
1. `GET /health` (Public, unauthenticated, reveals no tenant data, returns `{"status":"ok","version":"0.1.0"}`)
2. `GET /tools` (Authenticated, returns `EXPORT` and `VALIDATE` metadata with `rate_ms_per_record: 10`)
3. `GET /subscription` (Authenticated, returns `plan`, `status`, `daily_quota`, `used_today`, `remaining_quota`)
4. `POST /runs` (Authenticated Operator only, requires `Idempotency-Key`, accepts `{operation, records}`)
5. `GET /runs` (Authenticated, lists the authenticated tenant's run history only)
6. `GET /runs/{run_id}/result` (Authenticated, returns `{run_id, status, result}` or `{run_id, status, error}`; returns 404 for unknown or cross-tenant IDs)

### 1.3 Input Bounds, Row Validation (R1–R4) & Expected Fixtures
- **Input Bounds (A05)**: Reject payloads > 64 KiB, wrong shapes, missing fields, or batch sizes outside 1–10 rows with **HTTP 400 Bad Request**. Zero quota is debited and zero runs are created.
- **Rule Definitions**:
  - **R1**: `record_id` is a non-empty string of at most 20 characters, unique within the batch (only subsequent duplicates flagged).
  - **R2**: `tool` is either `EXPORT` or `VALIDATE`.
  - **R3**: `record_count` is an integer from 1 to 1000 inclusive (rejects booleans and numeric strings).
  - **R4**: `environment` is either `TEST` or `STAGE`.
- **Valid Fixture (A02, A04)**:
  - Row 1: `J01`, `EXPORT`, `20`, `TEST` -> `estimated_ms: 200`
  - Row 2: `J02`, `VALIDATE`, `10`, `STAGE` -> `estimated_ms: 100`
  - Total summary: `input_rows: 2`, `total_records: 30`, `total_estimated_ms: 300`
- **Invalid Fixture (A03, A05)**:
  - 6 rows: J01 valid, J02 valid, followed by duplicate J01 (R1), tool DELETE (R2), record_count 0 (R3), and environment PROD (R4).
  - `validate` reports `valid_rows: 2`, `invalid_rows: 4`, and one issue each for R1, R2, R3, R4.
  - `process` immediately returns **HTTP 400** before acceptance, debiting zero quota.

### 1.4 Authentication, Role Enforcement & Security Hardening
- **Tenant Context Acquisition**: Every protected route obtains tenant identity strictly from verified token context in `get_tenant_context()`.
- **Spoofing Prevention**:
  - Direct injection of `X-Tenant-Id` headers by untrusted callers is **strictly rejected**.
  - Request body attempts to specify or override `tenant_id` are rejected with HTTP 400.
  - Fabricated or unknown tokens (e.g., `Bearer invalid-token-xyz`) return HTTP 401 Unauthorized.
  - Viewer role submitting to `POST /runs` returns HTTP 403 Forbidden.
  - Basic plan attempting `process` returns HTTP 403 Forbidden.
  - Suspended subscriptions return HTTP 403 Forbidden for new submissions while preserving historical reads.
- **Production Blocker**: In the absence of organizer-supplied enterprise identity middleware (OIDC / Azure AD JWT validation), the application uses competition-seeded tokens (`token-tenant-a-operator`, `token-tenant-b-operator`, etc.).

### 1.5 Database Persistence, Concurrency & Cloud Durability
- **Schema & Uniqueness**: The `runs` table enforces uniqueness on `(tenant_id, idempotency_key)`, and `daily_usage` enforces uniqueness on `(tenant_id, utc_date)`.
- **Atomic Quota Reservation**: Quota reservation is executed via atomic conditional SQL updates (`UPDATE daily_usage SET count = count + 1 WHERE tenant_id = :t AND utc_date = :d AND count < :max_quota`). Under concurrent competition for the final quota slot, exactly one request receives HTTP 201 and the other receives HTTP 429.
- **Idempotency Lifecycle**:
  - Matching replay returns the original run with HTTP 200 OK without re-executing or debiting quota, even at exhausted quota.
  - Key reuse with changed input payload returns HTTP 409 Conflict.
  - Simultaneous identical keys are serialized to at most one run.
  - A11 forced failure test hook records terminal status `Failed` and error details while consuming 1 slot.
- **Database Engine Limitation & Cloud Blocker**:
  - The live Azure Container App deployment (`workloadlens-api-dev`) runs with embedded file-based SQLite (`sqlite:////app/entitlesim.db`).
  - While single-instance concurrency passes, **multi-instance horizontal scale durability across multiple Container App replicas is UNVERIFIED in the cloud**. Full multi-instance production durability requires provisioning Azure Database for PostgreSQL and applying `migrations/001_create_runs_and_daily_usage.sql`.

---

## 2. Acceptance Checks Status (A01–A12)

| Check | Specification Requirement | Verification Classification | Status | Evidence Location & Verification Command | Blockers / Environment Dependencies |
|---|---|---|---|---|---|
| **A01** | Terraform validate & deploy pass; `/health` returns 200; 2nd plan has 0 changes; only assigned resources targeted. | **Cloud Verified** | **PASS** | Live FQDN: `https://workloadlens-api-dev.../health`<br>[`evidence/health-response.json`](../evidence/health-response.json)<br>[`evidence/terraform-no-changes.txt`](../evidence/terraform-no-changes.txt)<br>`curl.exe -i -s https://.../health` | None. 2 managed resources (`azurerm_container_app.api`, `azurerm_storage_container.data`) verified live in Azure. |
| **A02** | `validate` on 2-row valid fixture (J01, J02) reports `valid_rows: 2`, `invalid_rows: 0`, and no issues. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a02_valid_fixture_validation`<br>`pytest tests/test_uc05_acceptance.py -k a02` | None. Verified via automated test. |
| **A03** | `validate` on 6-row invalid fixture reports `valid_rows: 2`, `invalid_rows: 4`, and R1–R4 failures. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a03_invalid_fixture_validation`<br>`pytest tests/test_uc05_acceptance.py -k a03` | None. Verified via automated test. |
| **A04** | Pro `process` returns exact expected rows (J01: 200ms, J02: 100ms, total: 300ms); survives app restart. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a04_pro_process_execution_and_persistence`<br>`pytest tests/test_uc05_acceptance.py -k a04` | Local SQLite file restart verified. Remote Azure SQL persistence unverified. |
| **A05** | Invalid process input, wrong body, and 11-row batch return 400 with no run or quota debit. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a05_invalid_process_input_and_shape_rejection`<br>`pytest tests/test_uc05_acceptance.py -k a05` | None. Verified via automated test. |
| **A06** | Unauthenticated requests return 401; Viewer submit & Basic process return 403 with no quota debit. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a06_auth_and_role_enforcement`<br>`pytest tests/test_uc05_acceptance.py -k a06` | None. Verified via automated test. |
| **A07** | Tenant B cannot list/get Tenant A's runs; tenant override in request is rejected; cross-tenant returns 404. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a07_tenant_isolation_and_override_rejection`<br>`pytest tests/test_uc05_acceptance.py -k a07` | None. Verified via automated test. |
| **A08** | Basic accepts 3 runs, rejects 4th with 429; concurrent race condition for last slot accepts exactly 1. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a08_basic_quota_and_concurrency`<br>`pytest tests/test_uc05_acceptance.py -k a08` | Tested under multi-threaded concurrency locally. Multi-replica Azure concurrency unverified. |
| **A09** | At exhausted quota, matching key returns 200 without debit; changed input returns 409; duplicate keys deduplicated. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a09_idempotency_terminal_replay_and_conflict`<br>`pytest tests/test_uc05_acceptance.py -k a09` | None. Verified via automated test. |
| **A10** | Suspended subscription rejects new submissions with 403; authorized historical reads continue to work. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a10_suspended_subscription`<br>`pytest tests/test_uc05_acceptance.py -k a10` | None. Verified via automated test. |
| **A11** | Test hook forces processing failure: status `Failed`, error recorded, 1 slot used, replay returns Failed. | **Locally Tested** | **PASS** | `backend/tests/test_uc05_acceptance.py::test_a11_forced_failure_hook`<br>`pytest tests/test_uc05_acceptance.py -k a11` | None. Verified via automated test. |
| **A12** | Teammate starts fresh assistant session, follows `SKILL.md`, reproduces valid/invalid/failure checks with redacted evidence. | **Not Run** | **UNVERIFIED** | See §3 for reproducible teammate checklist.<br>`skills/automation-preview/SKILL.md` | Requires a separate fresh assistant session or independent evaluator. |

---

## 3. Teammate Fresh-Session Replay Checklist (A12 — Peer Verifier: Poojhaa K)

**Intended Peer Verifier:** Poojhaa K (`Govindharaju_1951`, pending profile URL verification).  
**Privacy Safeguard:** No personal credentials, passwords, or private access tokens are required or permitted to be logged. Replay operations utilize standard test fixture identity tokens (`token-tenant-a-operator`) as detailed below.

To complete check A12 in an independent session:

1. **Clone & Setup**:
   ```bash
   git clone https://github.com/Sahanaa77/UC-05_automation-workload.git
   cd UC-05_automation-workload
   git checkout feature/uc05-infra-docs
   ```
2. **Execute Automated Verification Suite**:
   ```bash
   cd backend && python -m pytest tests/ -v
   # Must report 33 passed, 0 failed in ~8s
   ```
3. **Build Frontend**:
   ```bash
   cd frontend && npm run build
   # Must compile cleanly (0 errors) in ~30s
   ```
4. **Live Azure Smoke Test**:
   ```bash
   curl -i "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"
   # Must return HTTP 200 OK with {"status":"ok","version":"0.1.0"}
   ```
5. **Execute Valid Fixture via API**:
   ```bash
   curl -X POST "https://<fqdn>/runs" \
     -H "Authorization: Bearer token-tenant-a-operator" \
     -H "Idempotency-Key: a12-test-valid-01" \
     -H "Content-Type: application/json" \
     -d '{"operation":"validate","records":[{"record_id":"J01","tool":"EXPORT","record_count":20,"environment":"TEST"},{"record_id":"J02","tool":"VALIDATE","record_count":10,"environment":"STAGE"}]}'
   # Expect HTTP 201 with valid_rows: 2, invalid_rows: 0
   ```
6. **Execute Invalid Fixture via API**:
   Submit 6-row invalid fixture; expect HTTP 201 with `valid_rows: 2, invalid_rows: 4` and issues for R1–R4.
7. **Execute Forced Failure via API**:
   Submit with `-H "X-Test-Force-Failure: 1"`; expect HTTP 201 with `status: "Failed"`. Replaying with same key returns HTTP 200.
8. **Record Redacted Evidence**:
   Save console logs to `evidence/teammate-replay-log.txt`.

---

## 4. Test Commands and Actual Outcomes

| Test Category | Command Executed | Actual Outcome | Status |
|---|---|---|---|
| **Backend Test Suite (33 tests)** | `cd backend; python -m pytest tests/ -v` | `33 passed, 1 warning in 7.91s` | **PASS** |
| **Acceptance Tests (12 tests)** | `cd backend; python -m pytest tests/test_uc05_acceptance.py -v` | `12 passed, 1 warning in 6.68s` | **PASS** |
| **Frontend Production Build** | `cd frontend; npm run build` | `tsc -b && vite build` built in 33.84s; 2247 modules transformed | **PASS** |
| **Live Azure Health Smoke Test** | `curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"` | `HTTP/1.1 200 OK`, `Server: uvicorn`, `{"status":"ok","version":"0.1.0"}` | **PASS** |
| **Bash Syntax Check** | `& "E:\Git\bin\bash.exe" -c "bash -n scripts/deploy.sh && bash -n scripts/verify.sh && bash -n scripts/cleanup.sh"` | `All scripts syntax OK` | **PASS** |
| **Terraform Formatting & Validation** | `cd infra; terraform fmt -check; terraform validate` | `Success! The configuration is valid.` | **PASS** |
| **Git Diff Whitespace Check** | `git diff --check` | 0 errors | **PASS** |

---

## 5. Deliverable Archive (ZIP)

The handover package has been regenerated:
- **Archive File:** `workloadlens-handover.zip`
- **Exclusions:** Excludes `.venv`, `node_modules`, `.terraform`, `.pytest_cache`, `.git`, `.tfstate`, and secrets.
- **Contents:**
  - `infra/` (`main.tf`, `variables.tf`, `outputs.tf`, `environments/dev.tfvars`, `environments/prod.tfvars`)
  - `scripts/` (`deploy.sh`, `verify.sh`, `cleanup.sh`)
  - `skills/automation-preview/` (`SKILL.md`)
  - `docs/` (`deployment-runbook.md`, `UC05_AUDIT_REPORT.md`, specifications)
  - `evidence/` (`health-response.json`, `verify-curl.txt`, `terraform-plan.txt`, `terraform-apply.txt`, `terraform-no-changes.txt`, `ci-results.md`, `README.md`)
  - `migrations/` (`001_create_runs_and_daily_usage.sql`)
  - `Dockerfile` (Multi-stage build)
  - `README.md` and `.gitignore`
