# WorkloadLens UC-05 — Login Credentials & Authentication Evidence

> **Use Case ID:** UC-05 | **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Team:** Code Sapiens | **Revision:** 2  
> **Verification Date:** October 21, 2026 (`2026-10-21T09:59:29Z`)  
> **Environment:** Local Development & Azure Container Apps (`rg-uc05-demo`)

---

## 1. Application & Login Endpoints

| Environment | Endpoint URL | Endpoint Status | Verified Response |
| :--- | :--- | :--- | :--- |
| **Live Cloud UI Frontend** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK` (Serves React 19 SPA on port 8000). |
| **Live Cloud API Health** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK` (`{"status":"ok","version":"0.1.0"}`). |
| **Live Cloud Workload API** | `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/tools` | **VERIFIED (Live Cloud)** | `HTTP/1.1 200 OK` (Authenticated with evaluation token). |
| **Local Application & UI** | `http://127.0.0.1:8000/` | **VERIFIED (Local)** | `HTTP/1.1 200 OK` (FastAPI serves compiled React 19 SPA). |
| **Local Workload API** | `http://127.0.0.1:8000/tools` | **VERIFIED (Local)** | `HTTP/1.1 200 OK` (Authenticated with test tokens). |

---

## 2. Authentication Architecture & Login Procedure

Per the official competition specification (`UC-05_automation-workload.docx`, Section *The shared SaaS contract*):
> *"Tenant context comes only from the verified session. Never accept tenant identity from request data or an editable browser field."*
> *"All other routes require authentication: use 401 when absent, 403 for role/plan/subscription denial, 404 for an unknown or another tenant's run ID, and 429 for quota exhaustion."*

### How Authentication Operates:
1. **Bearer Token Authorization:** All protected endpoints require an HTTP `Authorization` header formatted as `Bearer <token>`.
2. **Context Resolution:** The backend middleware ([`backend/entitlesim/workload/auth.py`](file:///c:/Users/admin/Downloads/uc05-Code-Sapiens/backend/entitlesim/workload/auth.py)) extracts the token and resolves:
   - `tenant_id` (`tenant-a`, `tenant-b`, `tenant-suspended`)
   - `role` (`operator` or `viewer`)
   - `plan` (`basic` with 3 runs/day or `pro` with 10 runs/day)
   - `status` (`active` or `suspended`)
3. **Spoofing Prevention:** Direct client-side injection of `X-Tenant-Id` or request body `tenant_id` is strictly rejected with `HTTP 401` or `HTTP 400`.
4. **Interactive Form:** The UC-05 specification explicitly defines no interactive login or signup form (*"No tenant administrator or billing UI is required"*). The frontend UI transparently attaches the tenant's Bearer token to API calls.

---

## 3. Verified Test Accounts & Roles

The following non-secret evaluation tokens represent pre-provisioned competition identities seeded into the application:

| Identity / Tenant | Plan | Role | Seeded Evaluation Token | Allowed Permissions | Verified In Live Cloud Deployment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tenant A (Pro)** | Pro | **Operator** | `token-tenant-a-operator` | Submit `validate`, submit `process`, list runs, view results | **PASS (HTTP 201 Created)** |
| **Tenant A (Pro)** | Pro | **Viewer** | `token-tenant-a-viewer` | List runs, view results (`POST /runs` returns 403) | **PASS (HTTP 403 Forbidden)** |
| **Tenant B (Basic)** | Basic | **Operator** | `token-tenant-b-operator` | Submit `validate`, list runs, view results (`process` returns 403) | **PASS (HTTP 403 on process)** |
| **Tenant B (Basic)** | Basic | **Viewer** | `token-tenant-b-viewer` | List runs, view results (`POST /runs` returns 403) | **PASS (HTTP 403 on submit)** |
| **Tenant Suspended** | Pro | **Operator** | `token-tenant-suspended-operator` | List runs, view results (New submissions return 403) | **PASS (HTTP 403 on submit)** |

---

## 4. Real Verification Execution Results (Live Azure Container Apps)

The evaluation credentials were tested live against `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`:

### Check 1: Missing Authentication
```bash
GET /tools (No Authorization header)
Outcome: HTTP 401 Unauthorized
Response: {"detail": "Authentication credentials required. Supply Bearer token in Authorization header."}
Status: PASS (Cloud Verified)
```

### Check 2: Fabricated / Invalid Token
```bash
GET /tools (Authorization: Bearer invalid-fake-token-12345)
Outcome: HTTP 401 Unauthorized
Response: {"detail": "Invalid or unauthorized Bearer token."}
Status: PASS (Cloud Verified)
```

### Check 3: Authenticated Operator Access
```bash
GET /tools (Authorization: Bearer token-tenant-a-operator)
Outcome: HTTP 200 OK
Response: {"tools": [{"name": "EXPORT", "rate_ms_per_record": 10}, {"name": "VALIDATE", "rate_ms_per_record": 10}]}
Status: PASS (Cloud Verified)
```

### Check 4: Quota & Subscription Resolution
```bash
GET /subscription (Authorization: Bearer token-tenant-a-operator)
Outcome: HTTP 200 OK
Response: {"tenant_id": "tenant-a", "plan": "Pro", "status": "active", "daily_quota": 10, "used_today": 2, "remaining_quota": 8}
Status: PASS (Cloud Verified)
```

### Check 5: Viewer Role Submission Rejection
```bash
POST /runs (Authorization: Bearer token-tenant-a-viewer, Idempotency-Key: viewer-test-01)
Outcome: HTTP 403 Forbidden
Response: {"detail": "Viewer role cannot submit runs. Operator role required."}
Status: PASS (Cloud Verified)
```

### Check 6: Basic Plan Processing Denial
```bash
POST /runs (Authorization: Bearer token-tenant-b-operator, operation: process)
Outcome: HTTP 403 Forbidden
Response: {"detail": "Basic plan permits validation only. Pro plan required for workload processing."}
Status: PASS (Cloud Verified)
```

### Check 7: Suspended Subscription Denial
```bash
POST /runs (Authorization: Bearer token-tenant-suspended-operator)
Outcome: HTTP 403 Forbidden
Response: {"detail": "Subscription is suspended. New submissions are blocked."}
Status: PASS (Cloud Verified)
```

---

## 5. Organizer-Supplied Dependencies & Missing Items

Per Section 1 of `UC-05_automation-workload.docx` (*"What organisers supply"*):
> *"Supply the same language/framework starter, trusted login middleware, SQL/Blob client wrappers, Terraform scaffolding, test harness and processing-helper interface."*

The following item remains an external dependency that only the organizer can supply:
- **Central Trusted Login Middleware / OIDC Gateway:** The organizer-provided central authentication gateway (e.g., Azure AD / Entra ID tenant bearer token validator) was not provided in the competition starter package. The application provides competition-seeded evaluation tokens to enable reproducible offline evaluation.
