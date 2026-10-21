---
name: automation-preview
description: >
  Operational runbook and skill guide for deploying, verifying, testing, troubleshooting,
  and safely cleaning up the WorkloadLens API on Azure Container Apps using Terraform and
  the scripts in scripts/. Includes UC-05 fixture testing, forced-failure procedures,
  image rollback, and infrastructure safety boundaries.
---

# Skill: automation-preview — WorkloadLens UC-05 Operational Guide

> Deploy and operate the **WorkloadLens** API (FastAPI, port 8000) on Azure Container Apps
> using Terraform and the three helper scripts in `scripts/`.
> Covers preflight checks, deployment, verification, acceptance fixtures, forced-failure testing,
> image rollback, and guarded cleanup.

---

## 1. Trigger Conditions & Required Inputs

### Trigger Conditions
Activate this skill when:
- Deploying or re-deploying WorkloadLens to the Azure dev/prod sandbox.
- Performing acceptance checks A01–A12 or running smoke/health verification.
- Testing UC-05 workload fixtures (valid, invalid, or forced failure).
- Rolling back the Container App to a previously verified container image tag.
- Tearing down team-managed resources at the conclusion of an evaluation session.

### Required Inputs
Before execution, verify these inputs are available in your shell environment:

| Input Variable | Purpose | How Supplied |
|---|---|---|
| `ENV` | Environment selector (`dev` or `prod`) | `export ENV=dev` |
| `TF_VAR_database_url` | PostgreSQL or SQLite database connection string | `export TF_VAR_database_url="..."` (never in VCS) |
| `TF_VAR_acr_password` | Container Registry password for image pull | `export TF_VAR_acr_password=$(az acr credential show ...)` |
| `infra/environments/${ENV}.tfvars` | Environment parameters (Resource Group, Environment ID, Storage Account, Image) | File populated with verified values |

---

## 2. Preflight Checks & Safety Boundaries

Execute these commands before any deployment or verification step:

```bash
# 1. Verify required CLI tools
az version
terraform version
curl --version

# 2. Verify Azure authentication and active subscription
az account show --query "{name:name, id:id, tenantId:tenantId}" -o table

# 3. Confirm target subscription matches authorization
# If incorrect, switch: az account set --subscription "<subscription-id>"

# 4. Verify parameter file contains zero FILL_IN_* placeholders
grep -n "FILL_IN_" infra/environments/dev.tfvars || echo "dev.tfvars OK: no placeholders"
```

### Safety Boundaries (Non-Negotiable)
1. **Never delete shared infrastructure**: The Resource Group (`rg-uc05-demo`), Container Apps Environment (`uc05-env`), Storage Account (`uc05storef6ea8975`), Azure SQL/PostgreSQL database, and Container Registry (`uc05registry7bef65da`) are pre-existing shared dependencies.
2. **Exactly two Terraform resources**: This module manages ONLY `azurerm_container_app.api` and `azurerm_storage_container.data`.
3. **No credentials in VCS**: Database URLs and ACR passwords must never be committed to files or printed in logs.

---

## 3. Deployment Procedure

Deploy the infrastructure and application using `scripts/deploy.sh`:

```bash
# Set deployment environment and credentials
export ENV=dev
export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"  # or sqlite default
export TF_VAR_acr_password=$(az acr credential show --name uc05registry7bef65da --query "passwords[0].value" -o tsv)

# Run deployment script (performs preflight, terraform init, validate, plan, prompts for confirmation, then applies)
./scripts/deploy.sh
```

### Explicit Stop Conditions for Deployment
Abort immediately and do not proceed if:
- `az account show` indicates an unauthorized subscription ID.
- `grep -c "FILL_IN_" infra/environments/${ENV}.tfvars` is greater than 0.
- `terraform plan` proposes creating resources other than `azurerm_container_app.api` and `azurerm_storage_container.data`.
- `terraform apply` exits with a non-zero exit code.

---

## 4. Verification Procedure

### Stage 1: Live Smoke Test
Verify the deployed Container App is responding over HTTPS on `/health`:

```bash
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)
./scripts/verify.sh "${FQDN}"
```

**Expected Result:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","version":"0.1.0"}
```

### Stage 2: Full A01 Verification (Smoke Test + Terraform Drift Check)
Run `verify.sh` with the environment parameter to perform both the live endpoint check and the Terraform idempotency check:

```bash
./scripts/verify.sh "${FQDN}" dev
```

**Exit Codes:**
- `0` = PASS (Stage 1 HTTP 200, Stage 2 zero Terraform drift).
- `2` = FAIL (Stage 2 detected unexpected drift between state and Azure).
- `1` = FAIL (HTTP error or Terraform execution failure).

> [!WARNING]
> **Health Check Limitation:** A successful `/health` response (HTTP 200) proves only that the container started, networking and TLS are functional, and the liveness probe passes. It does **NOT** prove compliance with UC-05 SaaS rules (R1–R4 row validation, tenant isolation, quota management, or idempotency).

---

## 5. UC-05 Fixture Testing Procedures

When testing the application business logic against UC-05 requirements:

### Procedure A: Valid Fixture Test (A02 / A04)
Submit the official 2-row valid fixture to `POST /runs` with an `Idempotency-Key` header:

```bash
curl -X POST "https://${FQDN}/runs" \
  -H "Authorization: Bearer <TOKEN_PRO_OPERATOR>" \
  -H "Idempotency-Key: fix-valid-001" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "validate",
    "records": [
      {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
      {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"}
    ]
  }'
```

**Expected Validate Result (A02):**
- HTTP 201 Created.
- `valid_rows`: 2, `invalid_rows`: 0, `issues`: `[]`.

**Expected Process Result (Pro Plan, A04):**
- When submitted with `"operation": "process"`, returns:
  - `J01`: `estimated_ms: 200`
  - `J02`: `estimated_ms: 100`
  - `summary`: `{"input_rows": 2, "total_records": 30, "total_estimated_ms": 300}`
- Result persists across Container App restarts.

---

### Procedure B: Invalid Fixture Test (A03 / A05)
Submit the 6-row invalid fixture (2 valid rows + 4 mutated copies of J01 with IDs X1–X4):
- `X1`: duplicate `record_id` `J01` (R1 violation).
- `X2`: `tool: "DELETE"` (R2 violation).
- `X3`: `record_count: 0` (R3 violation).
- `X4`: `environment: "PROD"` (R4 violation).

```bash
curl -X POST "https://${FQDN}/runs" \
  -H "Authorization: Bearer <TOKEN_PRO_OPERATOR>" \
  -H "Idempotency-Key: fix-invalid-001" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "validate",
    "records": [
      {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
      {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
      {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
      {"record_id": "X2", "tool": "DELETE", "record_count": 20, "environment": "TEST"},
      {"record_id": "X3", "tool": "EXPORT", "record_count": 0, "environment": "TEST"},
      {"record_id": "X4", "tool": "EXPORT", "record_count": 20, "environment": "PROD"}
    ]
  }'
```

**Expected Result (A03):**
- `valid_rows`: 2, `invalid_rows`: 4.
- Four distinct issues reported with 1-based `row_index`, `field`, and `rule_id` (`R1`, `R2`, `R3`, `R4`).
- With `"operation": "process"`, returns HTTP 400 Bad Request with no quota slot debited.

---

### Procedure C: Forced-Failure Test (A11)
Test failure handling using the organizer test hook:

```bash
curl -X POST "https://${FQDN}/runs" \
  -H "Authorization: Bearer <TOKEN_PRO_OPERATOR>" \
  -H "Idempotency-Key: test-forced-fail-001" \
  -H "X-Test-Force-Failure: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "process",
    "records": [
      {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"}
    ]
  }'
```

**Expected Result:**
1. Initial submission returns terminal `status: "Failed"` with recorded error message.
2. Exactly 1 quota slot is debited for the accepted run.
3. Replaying the identical request with the same `Idempotency-Key` returns the existing `Failed` run without re-executing or debiting quota.

---

## 6. Image Rollback Procedure

If a deployed container image introduces errors or fails acceptance:

1. **Identify the previous known-good image tag**:
   ```bash
   az acr repository show-tags --name uc05registry7bef65da --repository workloadlens --orderby time_desc -o table
   ```

2. **Option A: Re-deploy via Terraform (recommended)**:
   - Edit `infra/environments/dev.tfvars`:
     ```hcl
     container_image = "uc05registry7bef65da.azurecr.io/workloadlens:<PREVIOUS_STABLE_SHA>"
     ```
   - Re-run deployment:
     ```bash
     ENV=dev ./scripts/deploy.sh
     ```

3. **Option B: Fast targeted revision update via Azure CLI**:
   ```bash
   az containerapp update \
     --name workloadlens-api-dev \
     --resource-group rg-uc05-demo \
     --image uc05registry7bef65da.azurecr.io/workloadlens:<PREVIOUS_STABLE_SHA>
   ```

4. **Verify after rollback**:
   ```bash
   ./scripts/verify.sh "${FQDN}" dev
   ```

---

## 7. Guarded Cleanup Procedure

Tear down ONLY the team-managed resources (`azurerm_container_app.api` and `azurerm_storage_container.data`):

```bash
# 1. Dry-run inspection (safe — makes no changes)
ENV=dev ./scripts/cleanup.sh

# 2. Execute deletion (requires typing the exact Container App name to confirm)
ENV=dev ./scripts/cleanup.sh --execute
```

### Critical Destruction Constraints:
- `scripts/cleanup.sh` deletes ONLY the Container App and the Blob container.
- It will **NEVER** run `az storage account delete` or delete the Resource Group.
- If Terraform state is missing, follow the manual fallback procedure in `docs/deployment-runbook.md §8` and delete only the Container App and Blob container.

---

## 8. Troubleshooting Guide

| Symptom | Cause | Solution |
|---|---|---|
| `ABORT: TF_VAR_database_url is not set` | Missing required env var | Export connection string: `export TF_VAR_database_url="..."` |
| `ABORT: placeholder values remain` | Unfilled `.tfvars` | Replace all `FILL_IN_*` in `infra/environments/dev.tfvars` |
| `ABORT: Not authenticated to Azure` | Expired / missing login | Run `az login` and set subscription |
| `curl: (6) Could not resolve host` | Container App provisioning | Wait 30–60s for DNS propagation, re-run `verify.sh` |
| `HTTP 403 Forbidden` on `/health` | Ingress configuration error | Verify `ingress { external_enabled = true }` in `infra/main.tf` |
| `ImagePullError` on Container App | ACR credentials invalid | Verify `TF_VAR_acr_password` is populated and matches ACR admin password |
| `Plan: 2 to add` on `verify.sh` (drift) | State out of sync with cloud | Investigate state drift before re-applying |
