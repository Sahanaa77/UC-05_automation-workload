---
name: automation-preview
description: >
  Step-by-step guide for deploying the WorkloadLens API to Azure Container Apps
  using the infra/ Terraform module. Covers prerequisites, variable population,
  deploy/verify/cleanup scripts, and troubleshooting common failures.
---

# Skill: automation-preview

> Deploy the WorkloadLens API (FastAPI, port 8000) to Azure Container Apps
> using Terraform and the three helper scripts in `scripts/`.

---

## Prerequisites

Before running any script, confirm all of the following:

| Requirement | Check command |
|---|---|
| `az` CLI installed | `az version` |
| `terraform` ≥ 1.6 installed | `terraform version` |
| Authenticated to Azure | `az account show` |
| Correct subscription active | `az account show --query name -o tsv` |
| Container image built & pushed | `az acr repository show-tags -n <acr> --repository workloadlens` |
| `DATABASE_URL` ready (not committed) | *(manual check — never echo it)* |
| Existing Container Apps Environment resource ID known | Azure Portal → Container Apps Environments → Properties |

> **Registry note**: this module does not create an Azure Container Registry.
> The image must already be built and pushed to an accessible registry before
> `deploy.sh` runs. Coordinate with the backend team (Sanaa) on the image name
> and tag convention.

---

## Step 1 — Populate the environment parameter file

Edit `infra/environments/dev.tfvars` (or `prod.tfvars`).
Replace every `FILL_IN_*` value:

```hcl
resource_group_name          = "my-rg"
container_app_environment_id = "/subscriptions/.../managedEnvironments/my-env"
container_app_name           = "workloadlens-api-dev"
container_image              = "myacr.azurecr.io/workloadlens:dev-abc1234"
storage_account_name         = "workloadlensdev2024a"
```

Do **not** add `database_url` or `acr_password` here. Set them as environment variables:

```bash
# Database URL (Postgres or SQLite default):
export TF_VAR_database_url="postgresql://user:pass@host:5432/workloadlens"

# ACR pull password (retrieved from Azure CLI):
export TF_VAR_acr_password=$(az acr credential show --name <acr_name> --query "passwords[0].value" -o tsv)
```

---

## Step 2 — Deploy

```bash
ENV=dev ./scripts/deploy.sh
```

The script will:
1. Check all required tools are on PATH.
2. Confirm you are authenticated and prompt you to confirm the active subscription.
3. Detect any remaining `FILL_IN_*` placeholders and abort.
4. Run `terraform init → validate → plan` and display the plan.
5. Prompt for apply confirmation.
6. Apply (creates 2 resources: Container App + Blob container).
7. Call `verify.sh` automatically.

---

## Step 3 — Verify

The deploy script calls `verify.sh` automatically. You can also run it manually:

```bash
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)
./scripts/verify.sh "${FQDN}"
```

Expected output:

```
[INFO]  === WorkloadLens smoke test ===
[INFO]  Target URL: https://<fqdn>/health
[INFO]  HTTP status: 200
[INFO]  Response body:
  {"status": "ok"}

✔ PASS — https://<fqdn>/health returned HTTP 200 at 2024-...Z
```

---

## Step 4 — Save evidence

After a successful deploy, capture and verify the outputs in `evidence/`:

```bash
# 1. Pre-deployment plan (showing 2 resources to add)
terraform -chdir=infra plan -var-file=environments/dev.tfvars 2>&1 | tee evidence/terraform-plan.txt

# 2. Deployment apply output (showing 2 resources added)
terraform -chdir=infra apply ... 2>&1 | tee evidence/terraform-apply.txt

# 3. Post-deployment smoke test (HTTP status and headers)
curl -i "https://${FQDN}/health" > evidence/verify-curl.txt
curl -s "https://${FQDN}/health" > evidence/health-response.json

# 4. Fresh second plan (confirming 0 drift / no changes)
terraform -chdir=infra plan -var-file=environments/dev.tfvars -detailed-exitcode 2>&1 | tee evidence/terraform-no-changes.txt
```

See [`evidence/README.md`](../../evidence/README.md) for the full artifact index and CI results.

---

## Step 5 — Cleanup (opt-in, guarded)

```bash
# Dry-run first — no changes made:
ENV=dev ./scripts/cleanup.sh

# Execute after reviewing the dry-run output:
ENV=dev ./scripts/cleanup.sh --execute
```

You will be required to type the exact Container App name before any deletion.
Only the Container App and Blob container are deleted.
The Storage Account, Resource Group, and Container Apps Environment are never touched.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ABORT: TF_VAR_database_url is not set` | Missing env var | `export TF_VAR_database_url="..."` |
| `ABORT: placeholder values remain` | Unfilled `.tfvars` | Edit `dev.tfvars`, replace all `FILL_IN_*` |
| `ABORT: Not authenticated` | Not logged in | `az login` |
| `curl: (6) Could not resolve host` | Container App not yet started | Wait 30–60 s; re-run `verify.sh` |
| `HTTP 403` on `/health` | Ingress not external | Check `ingress.external_enabled = true` in `main.tf` |
| `Error: creating Container App: image not found` | Image not pushed | Build and push the image to the registry first |
| `Error: storage account name already taken` | Name not globally unique | Choose a different `storage_account_name` in `.tfvars` |
| `Error: resource group not found` | Wrong RG name | Double-check `resource_group_name` in `.tfvars` |
| `terraform state not found` (cleanup) | Module not applied or state is remote | Follow the manual procedure printed by `cleanup.sh` |

---

## What this module does NOT manage

| Resource | Owner |
|---|---|
| Azure Resource Group | Pre-existing; you supply the name |
| Azure Container Apps Environment | Pre-existing; you supply the resource ID |
| Azure Container Registry / image build | External; coordinate with Sanaa |
| Azure Database for PostgreSQL | External; `DATABASE_URL` is a runtime secret |
| Terraform remote state backend | Document in runbook; agree with team before creating |
