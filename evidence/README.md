# WorkloadLens — Submission Deployment Evidence Index

> **Environment:** Azure for Students<br>
> **Resource Group:** `rg-uc05-demo` (`southindia`)<br>
> **Container Apps Environment:** `uc05-env` (`centralindia`)<br>
> **Live Endpoint:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health`<br>
> **Branch:** `feature/uc05-infra-docs`

This directory contains genuine deployment, verification, and CI/CD artifacts captured directly from live operations. All subscription IDs, secrets, tokens, and passwords have been redacted.

---

## Evidence Artifact Index

| Artifact File | What It Proves | Capture Method | Verification / Key Result |
|---|---|---|---|
| [`health-response.json`](health-response.json) | The live Container App is active, reachable over HTTPS, and serving valid health JSON. | `curl.exe -s https://<fqdn>/health > evidence/health-response.json` | `{"status":"ok","version":"0.1.0"}` |
| [`verify-curl.txt`](verify-curl.txt) | Verified HTTP 200 response, Uvicorn server header, content-length, and date from the live Azure Container App. | `curl.exe -i https://<fqdn>/health` captured to file. | `HTTP/1.1 200 OK`, `Server: uvicorn` |
| [`terraform-plan.txt`](terraform-plan.txt) | Pre-deployment plan strictly targets 2 resources (`azurerm_container_app.api` and `azurerm_storage_container.data`) with 0 to change and 0 to destroy. | `terraform -chdir=infra plan -var-file=environments/dev.tfvars` before apply. | `Plan: 2 to add, 0 to change, 0 to destroy.` |
| [`terraform-apply.txt`](terraform-apply.txt) | Actual successful provisioning of both managed resources in Azure without errors. | Captured during `terraform -chdir=infra apply` execution. | `Apply complete! Resources: 2 added, 0 changed, 0 destroyed.` |
| [`terraform-no-changes.txt`](terraform-no-changes.txt) | Infrastructure idempotency: a second `terraform plan -detailed-exitcode` detects zero drift against Azure. | `terraform -chdir=infra plan -var-file=environments/dev.tfvars -detailed-exitcode` after apply. | `No changes. Your infrastructure matches the configuration.` (Exit code 0) |
| [`ci-results.md`](ci-results.md) | Full CI pipeline runs in GitHub Actions: unit tests, frontend build, Terraform validation, and ACR image publishing. | Captured from GitHub Actions API for runs `39428256140` and `39421605884`. | All 4 jobs completed `success` |

---

## Live Deployed Service Details

- **Container App Name:** `workloadlens-api-dev`
- **FQDN:** `workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io`
- **Ingress Target Port:** 8000 (HTTP internally, HTTPS externally on port 443)
- **Container Image:** `uc05registry7bef65da.azurecr.io/workloadlens:latest`
- **Blob Storage Container:** `workloadlens-data` (Private access, inside pre-existing account `uc05storef6ea8975`)
- **Database Engine:** SQLite embedded fallback (`sqlite:////app/entitlesim.db`) for isolated sandbox execution without cloud database cost.

---

## Redaction and Security Policy

In accordance with competition rules:
1. Azure Subscription IDs are redacted as `/subscriptions/a9ed4be1-[REDACTED]/...`.
2. Connection strings and ACR passwords are passed strictly as runtime environment variables (`TF_VAR_database_url`, `TF_VAR_acr_password`) and injected as Container App secrets.
3. No `.env` files, `.tfstate` files, or binary plan files are committed.
