# WorkloadLens

> **Automation Workload Preview SaaS** — Advantix Cloud & SaaS Engineering Challenge (UC-05)<br>
> **Team:** Code Sapiens | **Revision:** 2

---

## 1. Overview

**WorkloadLens** is a multi-tenant SaaS service designed to evaluate proposed automation jobs and estimate processing effort before execution:
- **Basic Customers**: Validate automation job requests against four strict domain rules (R1–R4) with a quota of 3 accepted runs per UTC day.
- **Pro Customers**: Validate job requests and generate a detailed processing workload preview (10 ms/record estimation rule) with a quota of 10 accepted runs per UTC day.
- **Core SaaS Controls**: Enforces trusted tenant session context, role-based access control (Operator submit vs. Viewer read-only), atomic daily quota reservation, and request deduplication via `Idempotency-Key`.

---

## 2. Architecture Diagram

The diagram below illustrates the WorkloadLens target architecture, distinguishing the client screens, API routes, business validation logic, and cloud hosting infrastructure.

```mermaid
flowchart TD
    %% ------------------------------------------------------------------------
    %% WorkloadLens: System Architecture Diagram
    %% ------------------------------------------------------------------------

    subgraph CLIENT ["1. Client & User Interface (React 19, TypeScript)"]
        UI_TOOLS["Run Tools Screen (/tools): Parameter submission, Plan & Quota indicator"]
        UI_HIST["History Screen (/history): Execution timeline, Status & Result inspector"]
    end

    subgraph API ["2. Backend API Layer (FastAPI, Port 8000)"]
        AUTH_MW["Auth & Tenant Context Middleware: Trusted Session Context"]
        R_PUB["Public: GET /health"]
        R_TENANT["Tenant: GET /tools, GET /subscription"]
        R_RUNS["Runs: POST /runs, GET /runs, GET /runs/{id}/result"]
    end

    subgraph LOGIC ["3. SaaS Logic & Processor Engine"]
        IDEMP["Idempotency Engine: Key + Tenant Hash, 409 Conflict Guard"]
        QUOTA["Atomic Quota Guard: UTC Daily Counter (Basic: 3, Pro: 10)"]
        VAL["Validation Engine: Rules R1 to R4 (record_id, tool, count, env)"]
        HELPER["Processing Helper: 10 ms / record workload estimator"]
    end

    subgraph DATA ["4. Persistence Layer"]
        DB_RUNS[("Runs Table: tenant_id, key, status, fingerprint")]
        DB_USAGE[("DailyUsage Table: tenant_id, utc_date, count")]
        BLOB_STORE[("Azure Blob Storage: workloadlens-data (Results Cache)")]
    end

    subgraph CLOUD ["5. Cloud Hosting & Deployment (Azure)"]
        ACA["Azure Container App: workloadlens-api-dev (Port 8000)"]
        ACR["Azure Container Registry: uc05registry7bef65da.azurecr.io"]
        GHA["GitHub Actions CI: Tests, Frontend Build, Terraform Validate, Image Push"]
    end

    %% Client to API
    CLIENT -->|HTTPS / Bearer Token| AUTH_MW
    AUTH_MW --> R_PUB
    AUTH_MW --> R_TENANT
    AUTH_MW --> R_RUNS

    %% API to Logic
    R_RUNS --> IDEMP
    IDEMP --> QUOTA
    QUOTA --> VAL
    VAL -->|Valid & Process| HELPER

    %% Logic to Data
    IDEMP <--> DB_RUNS
    QUOTA <--> DB_USAGE
    HELPER -.->|Optional Blob Offload| BLOB_STORE

    %% Hosting & Cloud Pipeline
    GHA -->|Build & Push Image| ACR
    ACR -->|Pull on Deploy| ACA
    ACA --- API
    ACA -.->|Private Blob Access| BLOB_STORE

    %% Monochrome Styling
    classDef default fill:#ffffff,stroke:#000000,stroke-width:1.5px,color:#000000;
    classDef storage fill:#fcfcfc,stroke:#000000,stroke-width:1.5px,stroke-dasharray: 4 2,color:#000000;
    class DB_RUNS,DB_USAGE,BLOB_STORE storage;
```

---

## 3. Specification & Input Rules (UC-05)

### Validation Rules (R1–R4)
Every submitted row is checked against all four rules. Strings are trimmed, IDs are case-sensitive, and each invalid row is counted once:

| Rule | Target Field | Valid Condition | Failing Condition (400 Bad Request) |
|---|---|---|---|
| **R1** | `record_id` | Non-empty string, length ≤ 20 characters, unique within the batch | Empty, >20 chars, or duplicate within batch |
| **R2** | `tool` | Must be `EXPORT` or `VALIDATE` | Any other value (e.g. `DELETE`, `IMPORT`) |
| **R3** | `record_count` | Integer from 1 to 1000 inclusive | Booleans, numeric strings, <1, or >1000 |
| **R4** | `environment` | Must be `TEST` or `STAGE` | Any other value (e.g. `PROD`, `DEV`) |

### Workload Fixtures
- **Valid Fixture (2 rows)**:
  - Row 1: `record_id: "J01"`, `tool: "EXPORT"`, `record_count: 20`, `environment: "TEST"` → 200 ms
  - Row 2: `record_id: "J02"`, `tool: "VALIDATE"`, `record_count: 10`, `environment: "STAGE"` → 100 ms
  - *Expected Pro Result:* Summary with `input_rows: 2`, `total_records: 30`, `total_estimated_ms: 300`.
- **Invalid Fixture (6 rows)**: 2 valid rows + 4 mutated copies (duplicate J01 for R1; tool `DELETE` for R2; count `0` for R3; env `PROD` for R4). Reports 2 valid, 4 invalid, with issues for R1–R4.

---

## 4. Implementation & Acceptance Verification

All six required routes and domain logic are implemented and backed by **32 passing backend tests** (`pytest tests/`):

1. **API Endpoints (`GET /health`, `GET /tools`, `GET /subscription`, `POST /runs`, `GET /runs`, `GET /runs/{id}/result`)**:
   - `/health` is public and exposes zero tenant information.
   - All other endpoints require trusted session authentication context.
   - `POST /admin/reset` is removed from public product routing.
2. **Acceptance Checks A02–A11 (Verified)**:
   - **A02 (Valid Fixture)**: 2 valid rows, 0 invalid rows, no issues reported.
   - **A03 (Invalid Fixture)**: 2 valid rows, 4 invalid rows, R1–R4 rule failures reported.
   - **A04 (Pro Process & Durability)**: Exact estimated times (J01: 200 ms, J02: 100 ms, total: 300 ms) persisted and retrievable via `GET /runs/{id}/result`.
   - **A05 (Invalid Process & Bounds Rejection)**: Invalid process input, wrong-shaped body, and >10-row batch return HTTP 400 without creating runs or debiting quota.
   - **A06 (Auth & Role Enforcement)**: Unauthenticated requests return 401; Viewer submission and Basic process return 403.
   - **A07 (Tenant Isolation)**: Cross-tenant run retrieval returns 404; tenant override in request body is rejected with 400.
   - **A08 (Daily Quota & Concurrency)**: Basic quota limit of 3 enforced (4th returns 429); atomic conditional SQL update guarantees exactly 1 accepted run under concurrent race conditions.
   - **A09 (Idempotency Replay)**: Matching terminal replay returns HTTP 200 with original run without re-execution or quota debit (even when quota is exhausted); changed input returns 409.
   - **A10 (Suspended Subscription)**: Suspended tenant rejects submissions with 403 while historical reads remain accessible.
   - **A11 (Forced Failure Hook)**: `X-Test-Force-Failure` hook persists `Failed` status with recorded error, debits 1 quota slot, and replays without re-execution.
3. **Frontend UI Screens**:
   - **Run Tools (`/tools`)**: Parameter submission, plan and remaining quota display, validation/processing response tables.
   - **History (`/history`)**: Tenant-scoped execution log and selected run result / recorded error viewer.
   - Served statically by FastAPI at `/` when built.

---

## 5. Live Cloud Deployment & Verification

### Verified Endpoint
- **Live Health URL:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health`
- **Region:** `centralindia` (Resource Group: `rg-uc05-demo`, Managed Environment: `uc05-env`)
- **Status:** Healthy (`HTTP 200 OK`, `{"status":"ok","version":"0.1.0"}`)

### Quick Deployment Runbook

```bash
# 1. Inspect environment parameters
nano infra/environments/dev.tfvars

# 2. Export runtime secrets via shell environment
export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"  # or sqlite fallback
export TF_VAR_acr_password=$(az acr credential show --name uc05registry7bef65da --query "passwords[0].value" -o tsv)

# 3. Deploy via guarded script
ENV=dev ./scripts/deploy.sh

# 4. Verify live health and infrastructure idempotency
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)
./scripts/verify.sh "${FQDN}" dev
```

### Verified Evidence Artifacts
Real deployment evidence is cataloged in [`evidence/README.md`](evidence/README.md):
- [`health-response.json`](evidence/health-response.json): Live API response (`HTTP 200`).
- [`verify-curl.txt`](evidence/verify-curl.txt): Live HTTP response headers from Azure Container Apps.
- [`terraform-plan.txt`](evidence/terraform-plan.txt): Pre-deployment plan showing exactly 2 resources to add.
- [`terraform-apply.txt`](evidence/terraform-apply.txt): Apply log confirming 2 resources created.
- [`terraform-no-changes.txt`](evidence/terraform-no-changes.txt): Second plan demonstrating zero infrastructure drift.
- [`ci-results.md`](evidence/ci-results.md): GitHub Actions CI workflow run logs.

---

## 6. Local Development & Testing

```bash
# Run backend test suite (32 passed: 21 engine + 11 UC-05 acceptance)
cd backend && python -m pytest tests/

# Build frontend production bundle
cd frontend && npm run build

# Validate Terraform configuration
cd infra && terraform fmt -check && terraform validate
```

---

## 7. Operational Skills & Cleanup

Operational procedures are defined in [`skills/automation-preview/SKILL.md`](skills/automation-preview/SKILL.md).

### Safe Tear-Down
```bash
# Dry-run inspection (safe — makes no changes)
ENV=dev ./scripts/cleanup.sh

# Targeted deletion (requires typing Container App name to confirm)
ENV=dev ./scripts/cleanup.sh --execute
```

> **Safety Notice:** Cleanup removes ONLY `azurerm_container_app.api` and `azurerm_storage_container.data`. The Resource Group, Container Apps Environment, Storage Account, and Database are shared dependencies and are NEVER deleted.
