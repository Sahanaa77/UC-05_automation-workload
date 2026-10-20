# WorkloadLens — Deployment Runbook

> **Scope of this runbook**: Infrastructure in `infra/` and scripts in `scripts/`.
> It does not cover backend or frontend development.
> For the application quickstart, see the main [README.md](../README.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [What Terraform Manages](#2-what-terraform-manages)
3. [Populate Variables](#3-populate-variables)
4. [First Deploy](#4-first-deploy)
5. [Smoke Test](#5-smoke-test)
6. [Updating the Container Image (Rollout)](#6-updating-the-container-image-rollout)
7. [Scaling](#7-scaling)
8. [Cleanup](#8-cleanup-guarded)
9. [Remote State Migration](#9-remote-state-migration)
10. [Security Notes](#10-security-notes)

---

## 1. Prerequisites

Install and verify the following before running any script:

```bash
az version          # Azure CLI — https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
terraform version   # Terraform >= 1.6 — https://developer.hashicorp.com/terraform/install
curl --version      # Usually pre-installed
```

**Azure authentication:**

```bash
az login
az account show          # Confirm subscription name and ID
# If wrong subscription:
az account set --subscription "<name-or-id>"
```

**Container image precondition:**
The container image must be built and pushed to a registry accessible by the
Container Apps environment **before** running `deploy.sh`. This module does not
build or push images. Coordinate with Sanaa (backend/frontend owner) on the
image name and tag convention.

---

## 2. What Terraform Manages

| Resource | Action |
|---|---|
| `azurerm_container_app` | **Created** by this module |
| `azurerm_storage_container` | **Created** by this module (inside an existing Storage Account) |
| Azure Storage Account | **Referenced** via data source — must already exist; never created or deleted |
| Azure Resource Group | **Referenced** via data source — never created or deleted |
| Azure Container Apps Environment | **Referenced** via resource ID variable — never created or deleted |
| Azure Container Registry | **External** — not in scope |
| Azure Database for PostgreSQL | **External** — `DATABASE_URL` is a runtime secret |
| Terraform state storage | **Local** (see §9 for remote migration) |

---

## 3. Populate Variables

### 3a. Edit `infra/environments/dev.tfvars`

Replace every `FILL_IN_*` value. Comments in the file explain each field.

```hcl
resource_group_name          = "my-resource-group"
environment_label            = "dev"
container_app_environment_id = "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.App/managedEnvironments/<env-name>"
container_app_name           = "workloadlens-api-dev"
container_image              = "myacr.azurecr.io/workloadlens:dev-abc1234"
storage_account_name         = "workloadlensdev2024a"   # must already exist, 3-24 lowercase alphanum
```

To find the Container Apps Environment resource ID:

```bash
az containerapp env show \
  --name <env-name> \
  --resource-group <rg> \
  --query id \
  --output tsv
```

### 3b. Supply `DATABASE_URL` at deploy time (never in a file)

```bash
export TF_VAR_database_url="postgresql://user:pass@host:5432/workloadlens"
```

> **Security**: `database_url` is declared `sensitive = true` in Terraform.
> It is passed into the Container App as a secret and is never written to logs
> or `.tfvars` files. The `.gitignore` already excludes `.env` and `.env.*`.

---

## 4. First Deploy

```bash
# From the repo root:
export TF_VAR_database_url="postgresql://user:pass@host:5432/workloadlens"
ENV=dev ./scripts/deploy.sh
```

The script runs five preflight checks and aborts on the first failure:

| Check | What it verifies |
|---|---|
| Tools on PATH | `terraform`, `az`, `curl` |
| ENV parameter | must be `dev` or `prod` |
| `TF_VAR_database_url` | set and non-empty |
| Placeholder detection | no `FILL_IN_*` values remain in `.tfvars` |
| Azure authentication | `az account show` succeeds |

After preflight, it prompts you to confirm the active subscription before
proceeding to `terraform plan`.

### Expected Terraform plan output

```
Plan: 2 to add, 0 to change, 0 to destroy.

  + azurerm_storage_container.data
  + azurerm_container_app.api
```

> If the plan shows any `destroy` actions, stop and investigate before applying.

---

## 5. Smoke Test

`deploy.sh` calls `verify.sh` automatically after apply.
To run it manually:

```bash
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)
./scripts/verify.sh "${FQDN}"
```

The script sends `GET https://<fqdn>/health` and asserts:
- HTTP 200
- Non-empty JSON body containing a `"status"` key

The Container Apps ingress serves HTTPS on port 443 and forwards to the
container's port 8000 internally. `verify.sh` always uses `https://`.

**Save real output to evidence:**

```bash
./scripts/verify.sh "${FQDN}" 2>&1 | tee evidence/verify-curl.txt
curl -s "https://${FQDN}/health"       | tee evidence/health-response.json
```

---

## 6. Updating the Container Image (Rollout)

To deploy a new image version:

1. Update `container_image` in `infra/environments/<env>.tfvars`.
2. Re-run `ENV=<env> ./scripts/deploy.sh`.
3. Terraform updates the Container App in-place (new revision in Single mode).
4. Re-run `verify.sh` to confirm the new revision is healthy.

> **Prod recommendation**: pin to an immutable digest or semver tag.
> Never use `:latest` in production.

---

## 7. Scaling

Edit `min_replicas` and/or `max_replicas` in the environment `.tfvars` file,
then re-apply:

```bash
ENV=prod ./scripts/deploy.sh
```

Terraform will update the Container App scale settings in-place.

---

## 8. Cleanup (guarded)

> **The cleanup script never deletes the Resource Group, Container Apps
> Environment, database, or any resource outside the two Terraform-managed
> resources.**

### Dry-run (safe — no changes)

```bash
ENV=dev ./scripts/cleanup.sh
```

This reads Terraform outputs, verifies subscription and resource IDs,
and prints what *would* be deleted plus the equivalent `az` commands.

### Execute (requires typed confirmation)

```bash
ENV=dev ./scripts/cleanup.sh --execute
```

You will be prompted to type the exact Container App name. The script then:

1. Verifies subscription ID matches resource IDs in state.
2. Deletes the Container App via `az containerapp delete --ids <id> --yes`.
3. Deletes the Blob container via `az storage container delete --name <name> --account-name <sa> --auth-mode login`.
   The Storage Account itself is a shared dependency and is **never deleted**.

**If Terraform state is unavailable**, the script stops and prints a manual
procedure. Follow it only after manually confirming resource ownership via tags.

### Manual procedure (state unavailable)

> **WARNING**: Delete only the Container App and Blob container.
> The Storage Account is a pre-existing shared dependency and must **never** be deleted by this procedure.

```bash
# List candidates:
az containerapp list -g <rg> --query '[].{name:name, tags:tags}' -o table
az storage account list -g <rg> --query '[].{name:name, tags:tags}' -o table

# Confirm tags (managed_by=terraform, project=workloadlens) before deleting:
az containerapp show -n <name> -g <rg> --query tags -o json
az storage account show -n <storage-account-name> -g <rg> --query tags -o json

# Delete only the Container App and Blob container after confirming ownership.
# Do NOT delete the Storage Account, Resource Group, or Container Apps Environment.
az containerapp delete -n <container-app-name> -g <rg> --yes
az storage container delete --name <blob-container-name> --account-name <storage-account-name> --auth-mode login
```

---

## 9. Remote State Migration

The module currently uses local Terraform state (`.tfstate` file).
**Do not use local state for team deployments.**

When the team agrees on a shared backend:

1. Provision a Storage Account and Blob container for state (outside this module).
2. Uncomment and configure the `backend "azurerm"` block in `infra/main.tf`.
3. Run `terraform -chdir=infra init -migrate-state`.
4. Confirm state was migrated, then delete the local `.tfstate` file.
5. Add `infra/terraform.tfstate*` to `.gitignore`.

---

## 10. Security Notes

| Rule | Detail |
|---|---|
| `database_url` — never in VCS | Supply only via `TF_VAR_database_url` env var |
| `.env` files are gitignored | Confirmed in repo `.gitignore` |
| Storage Account is private (existing) | Pre-existing; confirm `public_network_access_enabled = false` on the SA before use |
| Blob container is private | `container_access_type = "private"` in `main.tf` |
| TLS 1.2+ on Storage Account | This module does not manage the existing Storage Account. Operators must independently verify that `min_tls_version = TLS1_2` is configured on the pre-existing SA before use. |
| Container App secrets | `DATABASE_URL` stored as a Container App secret, not a plain env var |
| Cleanup requires typed confirmation | `cleanup.sh` validates resource IDs before any `az delete` call |
| Terraform state contains secrets | If remote state is used, restrict access to the state container |
