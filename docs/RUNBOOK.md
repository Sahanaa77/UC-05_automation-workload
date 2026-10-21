# WorkloadLens — Operations & Application Runbook

> **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Use Case ID:** UC-05 | **Revision:** 2 | **Team:** Code Sapiens  
> **Target Cloud:** Microsoft Azure (Azure Container Apps, Central India)  
> **Date:** October 2026

---

## 1. Purpose & Scope

This runbook provides technical operating procedures, local development instructions, automated testing guidance, deployment workflows, and troubleshooting steps for **WorkloadLens** (UC-05).

---

## 2. Prerequisites & Tools

Ensure the following tools are installed on your workstation:
- **Python:** 3.12 or 3.14 (with `pip` and `venv`)
- **Node.js:** 20.x or higher (with `npm`)
- **Azure CLI:** 2.60+ (`az account show`)
- **Terraform:** 1.6+ (`terraform version`)
- **Git:** 2.40+ (`git status`)
- **cURL:** CLI utility for API verification

---

## 3. Project Structure

```text
uc05-Code-Sapiens/
├── backend/
│   ├── entitlesim/
│   │   ├── main.py                # FastAPI entrypoint & static route mounting
│   │   ├── db.py                  # SQLAlchemy models (runs, daily_usage)
│   │   └── workload/              # UC-05 workload business logic
│   │       ├── auth.py            # Session context & role guards
│   │       ├── processor.py       # Effort preview engine (10 ms/record)
│   │       ├── quota.py           # Atomic daily quota manager
│   │       ├── router.py          # 6 required specification endpoints
│   │       ├── schemas.py         # Pydantic v2 validation models
│   │       └── validation.py      # Rules R1–R4 row validators
│   └── tests/
│       └── test_uc05_acceptance.py# 12 acceptance test scenarios
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── RunTools.tsx       # Screen 1: Workload input & execution
│   │   │   └── WorkloadHistory.tsx# Screen 2: Master-detail run history
│   │   └── components/            # Sidebar, navigation, and badges
│   └── package.json
├── infra/                         # Terraform 2-resource configuration
│   ├── main.tf                    # Container App + Private Blob Container
│   ├── environments/
│   │   ├── dev.tfvars             # dev environment variables
│   │   └── prod.tfvars            # prod environment variables
│   └── variables.tf
├── scripts/
│   ├── deploy.sh                  # Preflight-guarded deployment script
│   ├── verify.sh                  # Automated health & API smoke verifier
│   └── cleanup.sh                 # Safe teardown script
├── skills/
│   └── automation-preview/        # Automation Assistant Skill (SKILL.md)
├── migrations/
│   └── 001_create_runs_and_daily_usage.sql
├── Dockerfile                     # Multi-stage production container build
└── docs/                          # Architecture, audit, and design specifications
```

---

## 4. Local Environment Setup & Execution

### 4.1 Backend Setup
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -e ".[dev]"
```

### 4.2 Frontend Setup & Build
```bash
cd frontend
npm ci
npm run build
# Compiles React 19 SPA into frontend/dist/
```

### 4.3 Running Acceptance Tests
```bash
cd backend
python -m pytest tests/test_uc05_acceptance.py -v
# Output: 12 passed in ~6.7s (Valid fixtures, R1-R4, quotas, isolation, idempotency)
```

### 4.4 Running the Full Test Suite
```bash
cd backend
python -m pytest tests/ -v
# Output: 33 passed, 0 failed in ~7.9s
```

### 4.5 Starting the Application Locally
```bash
cd backend
uvicorn entitlesim.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Local UI:** [http://127.0.0.1:8000/](http://127.0.0.1:8000/) (FastAPI serves static production build)
- **Local API Health:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **Local Swagger Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 5. Specification API Endpoints Reference

All endpoints are registered at the root path:

| Method | Path | Authentication | Function & Expected Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | **Public** | Public probe. Returns `{"status":"ok","version":"0.1.0"}` (HTTP 200). |
| `GET` | `/tools` | **Bearer Token** | Returns metadata for `EXPORT` and `VALIDATE` (10 ms/record). |
| `GET` | `/subscription` | **Bearer Token** | Returns tenant ID, plan, status, and daily quota counts. |
| `POST` | `/runs` | **Operator Role** | Submits batch for validation or processing. Requires `Idempotency-Key` header. Returns HTTP 201 on success. |
| `GET` | `/runs` | **Bearer Token** | Lists historical runs for the authenticated tenant only. |
| `GET` | `/runs/{id}/result`| **Bearer Token** | Returns `{run_id, status, result\|error}`. Cross-tenant returns HTTP 404. |

---

## 6. Azure Cloud Deployment Procedures

### 6.1 Pre-Deployment Verification Status
- **Current Live State:**
  - Resource Group: `rg-uc05-demo` (Location: `centralindia`)
  - Container App Name: `workloadlens-api-dev`
  - Container Apps Environment: `uc05-env`
  - Current Image: `uc05registry7bef65da.azurecr.io/workloadlens:latest` (Commit `3c734dc`)
  - **Live `/health` Endpoint:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health` (**Verified: HTTP 200 OK**)
  - **Live Root UI:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/` (**Verified: HTTP 404 Not Found**)
- **Known Cause:** The live deployment runs an image built with the legacy backend-only Dockerfile. The multi-stage Dockerfile bundling the compiled frontend is ready locally and documented below.

### 6.2 Building & Deploying the Container Image (When Authorized)
> [!IMPORTANT]
> Do not execute deployment without explicit authorization from the project lead.

```bash
# 1. Build multi-stage image in Azure Container Registry
az acr build \
  --registry uc05registry7bef65da \
  --image workloadlens:v2-workloadlens-ui \
  --image workloadlens:latest \
  --file Dockerfile .

# 2. Update existing Azure Container App revision
az containerapp update \
  --name workloadlens-api-dev \
  --resource-group rg-uc05-demo \
  --image uc05registry7bef65da.azurecr.io/workloadlens:v2-workloadlens-ui

# 3. Verify deployment live
curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"
curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/"
```

### 6.3 Terraform Infrastructure Deployment
The deployment script enforces 4 preflight checks before running Terraform:
```bash
export TF_VAR_database_url="sqlite:////app/entitlesim.db"
ENV=dev ./scripts/deploy.sh
```
- Exactly two resources are managed: `azurerm_container_app.api` and `azurerm_storage_container.data`.
- Verify zero drift with: `cd infra && terraform plan -detailed-exitcode -var-file=environments/dev.tfvars`.

---

## 7. Troubleshooting Common Errors

### 7.1 HTTP 404 on Root UI URL (`/`)
- **Symptom:** API routes work, `/health` returns 200, but `/` returns `{"detail":"Not Found"}`.
- **Root Cause:** Container image does not contain `/app/frontend/dist`.
- **Resolution:** Verify that `Dockerfile` uses the multi-stage build (`COPY --from=frontend-builder /build/dist /app/frontend/dist`) and deploy the new image tag.

### 7.2 HTTP 400 Bad Request on `POST /runs`
- **Missing Header:** Ensure `Idempotency-Key` header is present.
- **Batch Size Violation:** Batch must contain between 1 and 10 records.
- **Payload Size:** Request body must be under 64 KiB.
- **Process on Invalid Batch:** In `operation: process`, any invalid row triggers an immediate HTTP 400 with 0 quota debited.

### 7.3 HTTP 403 Forbidden
- **Role Denial:** Viewer tokens cannot call `POST /runs`.
- **Plan Limitation:** Basic plan users attempting `operation: process` receive HTTP 403.
- **Suspended Subscription:** Tenants with `status: suspended` cannot submit new runs.

### 7.4 HTTP 409 Conflict
- **Payload Mismatch:** Submitting a previously used `Idempotency-Key` with a different body payload returns HTTP 409.
- **Run In Progress:** Replaying an idempotency key while the original run is still executing returns HTTP 409 `RUN_IN_PROGRESS`.

### 7.5 HTTP 429 Too Many Requests
- **Daily Quota Exhaustion:** The tenant has used all daily allocated runs (Basic: 3/day, Pro: 10/day). Quota resets at 00:00 UTC.

---

## 8. Rollback Procedures

If an updated Container App revision introduces regressions:

### 8.1 Rollback via Azure Container App Revisions
```bash
# Instantly roll back to known healthy image digest (commit 3c734dc)
az containerapp update \
  --name workloadlens-api-dev \
  --resource-group rg-uc05-demo \
  --image uc05registry7bef65da.azurecr.io/workloadlens@sha256:4a8dbabaf62bb2c511b267645c9a758892d0477457d5df34d804b55800f6bdc6
```

### 8.2 Verify Healthy State
```bash
curl.exe -i -s "https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health"
# Must return HTTP 200 OK {"status":"ok","version":"0.1.0"}
```

---

## 9. Security Precautions & Evidence Handling

- **Never Commit Secrets:** `.env` files, credentials, `.tfstate` files, and plan binaries are excluded from version control via `.gitignore`.
- **Tenant Context Security:** Tenant identity must always be acquired from the verified session context (`get_tenant_context()`). Client-supplied `X-Tenant-Id` headers are strictly rejected unless validated with a gateway shared secret.
- **Sanitized Evidence:** When capturing terminal output for handover or submission, sanitize Azure subscription IDs, bearer tokens, and connection strings.
