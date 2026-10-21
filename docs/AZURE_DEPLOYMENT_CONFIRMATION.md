# WorkloadLens — Azure Deployment Confirmation Document

> **Use Case ID:** UC-05 | **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Team:** Code Sapiens  
> **Target Subscription:** Azure for Students (`a9ed4be1-05c1-4d8b-835b-668ca2398443`)  
> **Target Environment:** Development (`dev`)  
> **Verification Timestamp:** `2026-10-21T09:59:29Z` (Local: `2026-10-21 15:29:29 +05:30`)  
> **Document Status:** Verified live against Azure Container Apps (`workloadlens-api-dev`)

---

## 1. Live UI & API Endpoints

| Endpoint Category | URL / Target | Verification Status | Verified HTTP Response & Evidence |
| :--- | :--- | :--- | :--- |
| **Live UI Frontend URL** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK`<br>`Content-Type: text/html`<br>Serves React 19 SPA (`index.html`) on port 8000. |
| **API Health Endpoint** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK`<br>`Server: uvicorn`<br>`{"status":"ok","version":"0.1.0"}` |
| **Workload Tools Route** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/tools` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK`<br>Returns `EXPORT` and `VALIDATE` metadata (10 ms/record). |
| **Subscription Route** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/subscription` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK`<br>Returns tenant ID, plan, quota, and daily usage. |
| **Workload Runs Route** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/runs` | **VERIFIED (Live Cloud)** | `HTTP/1.1 201 Created` (Submit) / `HTTP/1.1 200 OK` (List/Replay). |
| **Run Result Route** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/runs/{id}/result`| **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK` (Tenant match) / `HTTP/1.1 404` (Cross-tenant). |

---

## 2. Deployed Version Identifiers

| Attribute | Verified Identifier | Verification Source & Method |
| :--- | :--- | :--- |
| **Deployed Git Commit SHA** | `7531bc9ef5b9a7221cea9b0edc17ed30e70ea753` | Built via GitHub Actions and verified in ACR image manifest tags |
| **Container Image Tag** | `uc05registry7bef65da.azurecr.io/workloadlens:7531bc9ef5b9a7221cea9b0edc17ed30e70ea753` | Inspected via `az containerapp show` template container image |
| **Immutable Image Digest** | `sha256:a30110b05c6c938f8ee4ccdaace6ddcd8340776bcbdcfd6b6606ad29e8b2f472` | Verified via Azure Container Registry manifest digest |
| **Image Build Timestamp** | `2026-10-21T09:54:10.9116609Z` | ACR manifest creation timestamp |
| **Previous Revision (Rollback)** | `workloadlens-api-dev--latest` (`sha256:4a8dbabaf62bb2c511b267645c9a758892d0477457d5df34d804b55800f6bdc6`) | Retained in Azure Container Apps revision history |

---

## 3. Azure Infrastructure & Resources

All resources verified directly via Azure CLI (`az resource list -g rg-uc05-demo`):

| Resource Type | Resource Name | Azure Resource ID | Current Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Resource Group** | `rg-uc05-demo` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo` | `Succeeded` | Location: `centralindia` |
| **Container Apps Environment** | `uc05-env` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.App/managedEnvironments/uc05-env` | `Succeeded` | Managed environment hosting API |
| **Container Registry (ACR)** | `uc05registry7bef65da` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.ContainerRegistry/registries/uc05registry7bef65da` | `Succeeded` | Login server: `uc05registry7bef65da.azurecr.io` |
| **Container App** | `workloadlens-api-dev` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.App/containerApps/workloadlens-api-dev` | `Running` | Port: 8000, Replicas: 1 |
| **Storage Account** | `uc05storef6ea8975` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.Storage/storageAccounts/uc05storef6ea8975` | `Succeeded` | Pre-existing storage dependency |
| **Blob Container (Terraform Managed)** | `workloadlens-data` | `https://uc05storef6ea8975.blob.core.windows.net/workloadlens-data` | `Private` | Created & verified via Terraform (`main.tf:66`) |
| **Log Analytics Workspace** | `workspace-rguc05demo73tJ` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.OperationalInsights/workspaces/workspace-rguc05demo73tJ` | `Succeeded` | Environment diagnostics logging |

---

## 4. Evaluation Credentials & Role Context

In compliance with competition rules, no passwords, secrets, or cloud tokens are committed. The application enforces role-based access control via competition-seeded test tokens evaluated against `get_tenant_context()`:

| Test Role / Tenant | Evaluation Token / Header | Allowed Operations | Quota Allowance | Verified In Live Cloud Deployment |
| :--- | :--- | :--- | :--- | :--- |
| **Tenant A — Pro Operator** | `Authorization: Bearer token-tenant-a-operator` | `validate`, `process`, historical read | 10 runs/day | **PASS (HTTP 201 Created)** |
| **Tenant A — Pro Viewer** | `Authorization: Bearer token-tenant-a-viewer` | Historical read only (`POST` returns 403) | 10 runs/day | **PASS (HTTP 403 Forbidden)** |
| **Tenant B — Basic Operator** | `Authorization: Bearer token-tenant-b-operator` | `validate` only (`process` returns 403) | 3 runs/day | **PASS (HTTP 403 on process)** |
| **Tenant B — Basic Viewer** | `Authorization: Bearer token-tenant-b-viewer` | Historical read only (`POST` returns 403) | 3 runs/day | **PASS (HTTP 403 on submit)** |
| **Tenant Suspended — Operator**| `Authorization: Bearer token-tenant-suspended-operator`| Historical read only (New runs return 403) | 0 active slots | **PASS (HTTP 403 on submit)** |

---

## 5. Live Cloud Verification Evidence

Executed live against `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`:

1. **Root UI (`GET /`):**
   - Status: `HTTP/1.1 200 OK`
   - Content: Serves React 19 HTML bundle with `<div id="root"></div>` and compiled assets.
2. **Health Probe (`GET /health`):**
   - Status: `HTTP/1.1 200 OK`
   - Body: `{"status":"ok","version":"0.1.0"}`
3. **Valid Fixture (`POST /runs`):**
   - Status: `HTTP/1.1 201 Created`
   - Body: `status: "Succeeded"`, `input_rows: 2`, `total_records: 30`, `total_estimated_ms: 300`, `J01: 200 ms`, `J02: 100 ms`.
4. **Idempotency Replay (`POST /runs` same key):**
   - Status: `HTTP/1.1 200 OK`
   - Body: Returns existing run without debiting quota.
5. **Cross-Tenant Isolation (`GET /runs/{id}/result`):**
   - Status: `HTTP/1.1 404 Not Found` when Tenant B queries Tenant A's run.
6. **Role Guard (`POST /runs` by Viewer):**
   - Status: `HTTP/1.1 403 Forbidden` (`"Viewer role cannot submit runs"`).
7. **Plan Guard (`POST /runs` with `process` by Basic):**
   - Status: `HTTP/1.1 403 Forbidden` (`"Basic plan permits validation only"`).
8. **Invalid Fixture Validation (`POST /runs` with 6-row batch):**
   - Status: `HTTP/1.1 201 Created`
   - Body: `valid_rows: 2`, `invalid_rows: 4`, rule issues `['R1', 'R2', 'R3', 'R4']`.
9. **Forced Failure Hook (`POST /runs` with `X-Test-Force-Failure: 1`):**
   - Status: `HTTP/1.1 201 Created`
   - Body: `status: "Failed"`, `error: "Simulated processing failure (forced by test hook)"`.

---

## 6. Outstanding Blockers & Notes

1. **Central Organizer Auth Gateway:** The challenge starter kit did not include an enterprise identity provider (Azure AD / OIDC) middleware. The app uses pre-seeded competition tokens in compliance with the shared SaaS contract.
2. **Multi-Instance Cloud Concurrency:** Single-instance SQLite is verified live in Azure; horizontal multi-replica concurrency requires provisioning Azure PostgreSQL with `migrations/001_create_runs_and_daily_usage.sql`.
3. **Acceptance Check A12:** Marked **NOT RUN / UNVERIFIED** pending independent teammate replay.
