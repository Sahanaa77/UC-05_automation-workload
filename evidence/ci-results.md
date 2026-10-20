# GitHub Actions CI Verification Results

This document records the actual GitHub Actions CI workflow runs for the WorkloadLens UC-05 project.

---

## Latest CI Workflow Run: Commit `56e55cc`

- **Workflow Name:** `CI — WorkloadLens`
- **Run URL:** [https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140)
- **Run ID:** `39428256140`
- **Trigger Branch:** `feature/uc05-infra-docs`
- **Commit SHA:** `56e55cc4fec005943e006f237ec99bbbfa15e131`
- **Workflow Status:** `completed`
- **Overall Conclusion:** `success`
- **Created At:** 2026-10-20T13:11:13Z

### Job Status Breakdown

| Job | Status | Conclusion | Details / Job URL |
|---|---|---|---|
| **Backend tests (Python 3.12)** | `completed` | `success` | [Job 118646218407](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140/job/118646218407) — 21 engine & API unit tests passed |
| **Frontend build (Node 20)** | `completed` | `success` | [Job 118646218889](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140/job/118646218889) — `tsc --noEmit` + Vite bundle passed (2245 modules transformed) |
| **Terraform fmt + validate** | `completed` | `success` | [Job 118646219324](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140/job/118646219324) — `terraform fmt -check` & `terraform validate` passed |
| **Build & push image to ACR** | `completed` | `success` | [Job 118646427218](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39428256140/job/118646427218) — Built `backend/Dockerfile` and pushed to `uc05registry7bef65da.azurecr.io/workloadlens` |

---

## Image Build & Push Verification Run: Commit `6cdf5c8`

- **Workflow Name:** `CI — WorkloadLens`
- **Run URL:** [https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884)
- **Run ID:** `39421605884`
- **Trigger Branch:** `feature/uc05-infra-docs`
- **Commit SHA:** `6cdf5c8733800652283290f71dab467343edacd5`
- **Workflow Status:** `completed`
- **Overall Conclusion:** `success`
- **Created At:** 2026-10-20T12:21:16Z

### Job Status Breakdown

| Job | Status | Conclusion | Details / Job URL |
|---|---|---|---|
| **Frontend build (Node 20)** | `completed` | `success` | [Job 118623657603](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884/job/118623657603) |
| **Terraform fmt + validate** | `completed` | `success` | [Job 118623657734](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884/job/118623657734) |
| **Backend tests (Python 3.12)** | `completed` | `success` | [Job 118623658150](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884/job/118623658150) |
| **Build & push image to ACR** | `completed` | `success` | [Job 118623836558](https://github.com/Sahanaa77/uc05-Code-Sapiens/actions/runs/39421605884/job/118623836558) |

---

## Container Registry Image Verification

Pushed tags in `uc05registry7bef65da.azurecr.io/workloadlens`:
- `latest`
- `6cdf5c8733800652283290f71dab467343edacd5`
- `56e55cc4fec005943e006f237ec99bbbfa15e131`

Verified via Azure CLI:
```bash
az acr repository show-tags --name uc05registry7bef65da --repository workloadlens --orderby time_desc
```
