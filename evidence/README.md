# WorkloadLens — Deployment Evidence

> **This directory holds real deployment artifacts only.**
> No fabricated outputs. No placeholder screenshots.
> Every file here must be produced by running the actual commands shown below
> against a live Azure environment.

---

## How to use this directory

1. Run each command in the table below.
2. Save its output to the corresponding file path using `tee`.
3. For manual screenshots, capture them from the Azure Portal as instructed
   and save as PNG files in this directory.
4. Commit evidence files only after they contain **real** outputs.

---

## Required artifacts

| Artifact file | Command to produce | What to verify in the output |
|---|---|---|
| `terraform-plan.txt` | `terraform -chdir=infra plan -var-file=environments/dev.tfvars 2>&1 \| tee evidence/terraform-plan.txt` | Shows `Plan: 2 to add, 0 to change, 0 to destroy` |
| `terraform-apply.txt` | `terraform -chdir=infra apply ... 2>&1 \| tee evidence/terraform-apply.txt` | Shows `Apply complete! Resources: 2 added, 0 changed, 0 destroyed` |
| `verify-curl.txt` | `./scripts/verify.sh <fqdn> 2>&1 \| tee evidence/verify-curl.txt` | Last line contains `✔ PASS` and `HTTP 200` |
| `health-response.json` | `curl -s https://<fqdn>/health \| tee evidence/health-response.json` | JSON body with a `"status"` key |
| `azure-portal-screenshot.png` | Azure Portal → Container Apps → `<app-name>` → Overview | Running revision shown; FQDN visible |

---

## Commands (copy-paste ready)

Run from the repository root after a successful `deploy.sh`:

```bash
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)

# 1. Terraform plan
terraform -chdir=infra plan \
  -var-file=environments/dev.tfvars \
  2>&1 | tee evidence/terraform-plan.txt

# 2. Verify / health check
./scripts/verify.sh "${FQDN}" 2>&1 | tee evidence/verify-curl.txt

# 3. Raw health response
curl -s "https://${FQDN}/health" | tee evidence/health-response.json
```

> `terraform-apply.txt` must be captured during the actual apply run.
> Re-running plan after apply will show `No changes`, which is not sufficient.

---

## What does NOT belong here

- Fabricated or edited terminal output.
- Screenshots with placeholder or mocked data.
- Logs from a local `docker compose` run (this directory is for Azure evidence).
- Sensitive values such as connection strings or access tokens.

---

## Status

| Artifact | Status | Details |
|---|---|---|
| `terraform-plan.txt` | ✅ Verified | Plan: 2 to add, 0 to change, 0 to destroy |
| `terraform-apply.txt` | ✅ Verified | Apply complete! 2 added, 0 changed, 0 destroyed |
| `verify-curl.txt` | ✅ Verified | HTTP/1.1 200 OK from live Azure Container App |
| `health-response.json` | ✅ Verified | `{"status":"ok","version":"0.1.0"}` |
| `azure-portal-screenshot.png` | ⏳ Optional | Manual portal capture if desired |

### Live Deployed Endpoint
- **URL:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health`
- **Region:** `centralindia` (Environment: `uc05-env`, RG: `rg-uc05-demo`)
- **Status:** Healthy (HTTP 200)
