# WorkloadLens — Azure Deployment Confirmation Document

> **Use Case ID:** UC-05 | **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Team:** Code Sapiens  
> **Target Subscription:** Azure for Students (`a9ed4be1-05c1-4d8b-835b-668ca2398443`)  
> **Target Environment:** Development (`dev`)  
> **Verification Timestamp:** `2026-10-21T08:57:02Z` (Local: `2026-10-21 14:27:02 +05:30`)  
> **Document Status:** Verified against live Azure CLI and Azure Container Apps configuration

---

## 1. Live UI & API Endpoints

| Endpoint Category | URL / Target | Verification Status | Verified HTTP Response & Evidence |
| :--- | :--- | :--- | :--- |
| **API Health Endpoint** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK`<br>`Server: uvicorn`<br>`{"status":"ok","version":"0.1.0"}` |
| **Live UI Frontend URL** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/` | **BLOCKED (Not Deployed in Current Image)** | `HTTP/1.1 404 Not Found`<br>`{"detail":"Not Found"}`<br>*See Section 7 (Blockers).* |
| **Local Verified UI** | `http://localhost:5173/` (Vite Dev) / `http://localhost:8000/` (FastAPI Static SPA) | **VERIFIED (Local Build)** | `HTTP/1.1 200 OK`<br>React 19 SPA (`index.html`) successfully built and rendered. |

---

## 2. Deployed Version Identifiers

| Attribute | Verified Identifier | Verification Source & Method |
| :--- | :--- | :--- |
| **Deployed Git Commit SHA** | `3c734dcc8e5c118aa6c4c43a45dd82d0dfa83923` | ACR Manifest metadata (`az acr repository show-manifests`) matches git commit `3c734dc` |
| **Container Image Tag** | `uc05registry7bef65da.azurecr.io/workloadlens:latest` | Azure Container App configuration (`az containerapp show`) |
| **Immutable Image Digest** | `sha256:4a8dbabaf62bb2c511b267645c9a758892d0477457d5df34d804b55800f6bdc6` | Inspected via Azure Container Registry manifest digest |
| **Image Build Timestamp** | `2026-10-20T14:12:02.9198387Z` | ACR manifest creation timestamp |
| **Target Codebase Commit** | Latest working tree on `origin/feature/uc05-infra-docs` | `git status` / `git log` |

---

## 3. Azure Infrastructure & Resources

All resources verified directly via Azure CLI (`az resource list -g rg-uc05-demo`):

| Resource Type | Resource Name | Azure Resource ID | Current Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Resource Group** | `rg-uc05-demo` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo` | `Succeeded` | Location: `centralindia` |
| **Container Apps Environment** | `uc05-env` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.App/managedEnvironments/uc05-env` | `Succeeded` | Managed environment hosting API |
| **Container Registry (ACR)** | `uc05registry7bef65da` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.ContainerRegistry/registries/uc05registry7bef65da` | `Succeeded` | Login server: `uc05registry7bef65da.azurecr.io` |
| **Container App** | `workloadlens-api-dev` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.App/containerApps/workloadlens-api-dev` | `Running` | Port: 8000, Replicas: 1 (Single revision `workloadlens-api-dev--latest`) |
| **Storage Account** | `uc05storef6ea8975` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.Storage/storageAccounts/uc05storef6ea8975` | `Succeeded` | Pre-existing storage dependency |
| **Blob Container (Terraform Managed)** | `workloadlens-data` | `https://uc05storef6ea8975.blob.core.windows.net/workloadlens-data` | `Private` | Created & verified via Terraform (`main.tf:66`) |
| **Log Analytics Workspace** | `workspace-rguc05demo73tJ` | `/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.OperationalInsights/workspaces/workspace-rguc05demo73tJ` | `Succeeded` | Environment diagnostics logging |

---

## 4. Evaluation Credentials & Role Context

In compliance with competition rules, no passwords, secrets, or cloud tokens are committed. The application enforces role-based access control via competition-seeded test tokens evaluated against `get_tenant_context()`:

| Test Role / Tenant | Evaluation Token / Header | Allowed Operations | Quota Allowance | Verified In Local Suite |
| :--- | :--- | :--- | :--- | :--- |
| **Tenant A — Pro Operator** | `Authorization: Bearer token-tenant-a-operator` | `validate`, `process`, historical read | 10 runs/day | **PASS** (`test_a02`, `test_a04`) |
| **Tenant A — Pro Viewer** | `Authorization: Bearer token-tenant-a-viewer` | Historical read only (`POST` returns 403) | 10 runs/day | **PASS** (`test_a06`) |
| **Tenant B — Basic Operator** | `Authorization: Bearer token-tenant-b-operator` | `validate` only (`process` returns 403) | 3 runs/day | **PASS** (`test_a06`, `test_a08`) |
| **Tenant B — Basic Viewer** | `Authorization: Bearer token-tenant-b-viewer` | Historical read only (`POST` returns 403) | 3 runs/day | **PASS** (`test_a06`) |
| **Tenant Suspended — Operator**| `Authorization: Bearer token-tenant-suspended-operator`| Historical read only (New runs return 403) | 0 active slots | **PASS** (`test_a10`) |

*Limitation:* Central organizer OIDC / Azure AD gateway authentication middleware was not provided. Live deployed container app runs with `TEST_MODE=0`, strictly denying unauthenticated requests.

---

## 5. Local Running & Verification Steps

### Step 1: Run Full Backend Test Suite
```bash
cd backend
python -m pytest tests/ -v
# Output: 33 passed, 1 warning in 4.27s (Exit Code: 0)
```

### Step 2: Build Frontend Production SPA
```bash
cd frontend
npm run build
# Output: tsc -b && vite build completed in 12.56s (Exit Code: 0)
```

### Step 3: Start Application Locally (FastAPI + Embedded SPA)
```bash
cd backend
uvicorn entitlesim.main:app --host 127.0.0.1 --port 8000
# Access UI at http://127.0.0.1:8000/
# Access Health at http://127.0.0.1:8000/health
```

### Step 4: Verify Live Azure Health Endpoint
```bash
curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"
# Expected response: HTTP/1.1 200 OK {"status":"ok","version":"0.1.0"}
```

---

## 6. Live Evidence & Verification Timestamps

- **Cloud Verification Timestamp:** `2026-10-21T08:53:19Z`
- **Command Executed:**
  ```bash
  curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"
  ```
- **Live Output Captured:**
  ```http
  HTTP/1.1 200 OK
  Content-Length: 33
  Content-Type: application/json
  Date: Wed, 21 Oct 2026 08:53:19 GMT
  Server: uvicorn
  Vary: Origin

  {"status":"ok","version":"0.1.0"}
  ```
- **Terraform No-Changes Verification:** Recorded in [`evidence/terraform-no-changes.txt`](../evidence/terraform-no-changes.txt) (Plan: 0 to add, 0 to change, 0 to destroy).

---

## 7. Outstanding Blockers & Deployment Discrepancies

1. **Live UI URL Blocked by Deployed Container Image:**
   - The running Azure Container App revision (`workloadlens-api-dev--latest`) was deployed from commit `3c734dc` (`uc05registry7bef65da.azurecr.io/workloadlens:latest`), built using the legacy backend-only `backend/Dockerfile`.
   - The compiled React 19 frontend was not packaged into that image, resulting in `HTTP 404 Not Found` when requesting `GET /` on the live FQDN.
   - The complete root multi-stage `Dockerfile` is prepared locally, but deploying an updated image to Azure Container Apps requires explicit authorization to avoid unapproved cloud state changes.
2. **Central Organizer Authentication:**
   - Central organizer-provided OIDC / Azure AD bearer token validation middleware is unavailable. In non-test mode (`TEST_MODE=0`), token evaluation falls back to pre-seeded evaluation identities.
3. **Multi-Instance Cloud Concurrency:**
   - The cloud deployment currently uses embedded SQLite (`sqlite:////app/entitlesim.db`). While single-instance concurrency passes automated tests, multi-replica horizontal concurrency requires provisioning an Azure PostgreSQL instance using `migrations/001_create_runs_and_daily_usage.sql`.
4. **Acceptance Check A12 (Teammate Replay):**
   - Strictly marked **NOT RUN / UNVERIFIED** until an independent teammate completes the fresh-session replay guide in `docs/UC05_AUDIT_REPORT.md` §3.
