# WorkloadLens — Automation Workload Preview SaaS

**UC-05 | Cloud and SaaS Engineering Challenge | Team Code Sapiens**

WorkloadLens is a multi-tenant SaaS application that validates proposed automation jobs and provides a workload preview for eligible Pro subscribers. It checks job inputs, estimates processing effort, records run results, and enforces subscription plans, user permissions, daily quotas, and tenant isolation.

The workload estimate uses the challenge's fixed teaching rule of **10 milliseconds per record**. It is an illustrative estimate, not a real-world performance guarantee.

## Overview

WorkloadLens provides two operations:

- **Validate:** Check automation job requests against four validation rules and report valid rows, invalid rows, and validation issues.
- **Process:** Generate a workload preview for valid requests, including per-job estimated effort and an aggregate summary. This operation is available to Pro subscribers.

The application is designed around the shared UC-05 SaaS contract, with two standard screens: **Run Tools** and **History**.

## Key Features

- **Four validation rules:** Validate record IDs, supported tools, record counts, and execution environments.
- **Workload estimation:** Calculate estimated processing time and total record counts.
- **Multi-tenant access control:** Isolate data by verified tenant identity.
- **Subscription enforcement:** Support Basic and Pro plans, Operator and Viewer roles, and suspended subscriptions.
- **Daily usage limits:** Enforce tenant-wide quotas using UTC calendar days.
- **Idempotent requests:** Prevent duplicate execution and quota consumption when an accepted request is replayed with the same key and input.
- **Run history:** Retrieve past runs and their recorded results.
- **Failure handling:** Persist accepted runs that fail during processing without refunding their quota.
- **Cloud deployment:** Terraform-based infrastructure and deployment, verification, and cleanup scripts.
- **Automation skill:** A `SKILL.md` guide for repeatable deployment and verification workflows.

## How It Works

1. An authenticated user opens Run Tools.
2. The backend identifies the user's tenant, role, subscription, and plan.
3. The user submits a batch for validation or processing.
4. WorkloadLens checks the request structure and applies the four row-validation rules.
5. The backend checks request idempotency and atomically reserves quota for a newly accepted run.
6. The run is persisted, processed, and marked `Succeeded` or `Failed`.
7. The result is available through the API and History screen.

## Validation Rules

| Rule | Field | Requirement |
|---|---|---|
| R1 | `record_id` | Nonempty string, maximum 20 characters, unique within the batch |
| R2 | `tool` | Must be `EXPORT` or `VALIDATE` |
| R3 | `record_count` | Integer from 1 through 1000; booleans and numeric strings are invalid |
| R4 | `environment` | Must be `TEST` or `STAGE` |

Strings are trimmed before validation. Record IDs remain case-sensitive, and only subsequent occurrences of a duplicate ID are marked as duplicates. Each invalid row is counted once, even if it violates multiple rules.

## Example Workload Preview

Input:

| Record ID | Tool | Record Count | Environment |
|---|---|---:|---|
| J01 | EXPORT | 20 | TEST |
| J02 | VALIDATE | 10 | STAGE |

Expected processing result:

| Record ID | Estimated Time |
|---|---:|
| J01 | 200 ms |
| J02 | 100 ms |

Summary:

- Input rows: `2`
- Total records: `30`
- Total estimated time: `300 ms`

The valid fixture should produce two valid rows and zero invalid rows. The invalid fixture adds four rows containing one R1–R4 failure each, producing two valid rows and four invalid rows.

## SaaS Plans and Permissions

| Capability | Basic | Pro |
|---|---|---|
| Validate jobs | Allowed | Allowed |
| Process jobs | Not allowed | Allowed |
| Accepted runs per tenant per UTC day | 3 | 10 |

**Roles**

- **Operator:** Can submit eligible runs and read the tenant's run history and results.
- **Viewer:** Read-only access to the tenant's permitted information.

The daily allowance is shared by all users within a tenant. Suspended subscriptions cannot start new runs, but authorised users can still access historical data.

Each accepted unique run consumes one quota slot, including runs that subsequently fail. Rejected requests do not consume quota.

## Technology and Architecture

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python and FastAPI
- **Persistence:** SQL database
- **Object storage:** Private Azure Blob container
- **Cloud platform:** Azure Container Apps
- **Infrastructure as Code:** Terraform
- **Automation:** Shell scripts and `skills/automation-preview/SKILL.md`
- **CI/CD:** GitHub Actions workflow for backend image build and push

### Logical Architecture

```text
Operator / Viewer
       |
       v
React Web Application
       |
       v
FastAPI Backend
       |
       +--> Authentication and tenant authorization
       |
       +--> Request validation and idempotency
       |
       +--> Subscription and quota enforcement
       |
       +--> Workload processing helper
       |
       +--> SQL Database
       |      Runs
       |      DailyUsage
       |      Subscription data
       |
       +--> Private Blob Storage
              Result storage
```

The verified identity determines the tenant. Tenant identity must not be trusted from request bodies or editable browser fields.

## API Reference

WorkloadLens exposes the six required API routes.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Public health check |
| GET | `/tools` | List available tools and operations |
| GET | `/subscription` | Retrieve the current tenant's subscription and plan |
| POST | `/runs` | Validate or process a batch |
| GET | `/runs` | List the current tenant's runs |
| GET | `/runs/{id}/result` | Retrieve an authorised run's result or recorded failure |

### Submit a Run

`POST /runs` requires an `Idempotency-Key` header and a JSON body containing `operation` and `records`.

Supported operations are `validate` and `process`. A request must contain 1–10 records and remain within the 64 KiB request limit.

Important response behaviour:

- `201`: New accepted run, processed to a terminal status.
- `200`: Matching idempotent replay of a terminal run.
- `400`: Invalid request shape or invalid batch for processing.
- `401`: Missing authentication.
- `403`: Insufficient role, plan entitlement, or active subscription.
- `404`: Unknown run or run belonging to another tenant.
- `409`: Idempotency conflict or a matching run that is still running.
- `429`: Daily quota exhausted.

Validation issues identify the row using a 1-based `row_index`, together with the `field` and `rule_id`.

## Project Structure

```text
.
├── backend/                     FastAPI application and backend tests
├── frontend/                    React and TypeScript application
├── infra/                       Terraform configuration
│   └── environments/            Environment parameter files
├── scripts/                     Deployment, verification and cleanup
├── skills/
│   └── automation-preview/
│       └── SKILL.md              Automation workflow instructions
├── tests/                       Application and acceptance tests
├── evidence/                    Redacted verification evidence
├── .github/
│   └── workflows/               GitHub Actions workflows
├── README.md
└── RUNBOOK.md                   Deployment and operations guide, if present
```

The actual repository may contain additional files. The directory descriptions above indicate the intended responsibilities of each area.

## Local Development

### Prerequisites

Install Python, Node.js with npm, Git, and the dependencies required by the project. Azure CLI and Terraform are needed for cloud deployment, not ordinary frontend development.

### 1. Clone the repository

```powershell
git clone https://github.com/Sahanaa77/uc05-Code-Sapiens.git
cd uc05-Code-Sapiens
```

### 2. Start the backend

In PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set the required local environment variables according to the backend configuration and `.env.example` files. Do not commit secrets.

If the backend entry point is `backend/app/main.py`, start it with:

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If the supplied starter uses a different entry point, use the module path defined by the actual application. Keep the backend running in this terminal.

### 3. Start the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

Configure the frontend API base URL using the variable documented in `frontend/.env.example`. Ensure it points to the local backend.

### 4. Build the frontend

From the `frontend` directory:

```powershell
npm run build
```

A successful build should finish without TypeScript or bundling errors.

### 5. Run tests

From the repository root, inspect the test configuration and use the project's configured test commands. For a Python project using pytest, the usual command is:

```powershell
python -m pytest -q
```

Run the frontend build and relevant backend and acceptance tests before submitting changes. Record actual results rather than assuming that tests passed.

## Azure Deployment

The repository includes Terraform infrastructure and helper scripts intended for the assigned UC-05 environment.

The challenge specifies two Terraform-managed resources:

1. One Azure Container App.
2. One private Blob container inside a pre-existing Storage Account.

The Resource Group, Container Apps Environment, Storage Account, database, registry, managed identity, and permissions are supplied or configured through the authorised hackathon environment as applicable. Do not create or modify shared resources without permission.

Before deployment:

1. Confirm access to the assigned Azure sandbox and subscription.
2. Obtain the correct environment parameters and required secrets.
3. Build and publish the backend image to the authorised registry.
4. Review the Terraform plan and confirm that only the intended resources are targeted.
5. Deploy using the repository's scripts and verify `/health`.
6. Run the acceptance checks and retain redacted evidence.

Typical script entry points are:

```bash
ENV=dev ./scripts/deploy.sh
./scripts/verify.sh <application-url>
ENV=dev ./scripts/cleanup.sh
```

Check the scripts and `RUNBOOK.md` for their exact arguments, required environment variables, and cleanup confirmation procedure before running them. Never place credentials in Git or expose them in terminal logs.

## Acceptance and Verification

The UC-05 acceptance scope includes:

- Terraform validation, deployment, healthy `/health`, and a no-change second plan.
- Valid and invalid fixture results matching R1–R4.
- Exact workload-preview rows and summary.
- Result persistence and retrieval after an application restart.
- Rejection of invalid processing requests, malformed bodies, and batches exceeding ten rows without quota debit.
- Role, plan, subscription, and tenant-isolation enforcement.
- Daily quota limits and atomic reservation under concurrent requests.
- Idempotent replay and conflict handling.
- Recorded processing failures and correct quota consumption.
- A fresh assistant session reproducing the workflow using `SKILL.md`.

Store evidence under `evidence/` only after the corresponding checks have actually been executed. Redact credentials, connection strings, access tokens, and other sensitive values.

## Scope and Limitations

- The workload estimate is a fixed educational calculation, not a production latency guarantee.
- The application previews automation jobs; it does not execute external ERP writes or real-world automation.
- Tenant isolation and execution permissions are core security requirements.
- The challenge does not require payment checkout, signup, queues, schedulers, approval workflows, or additional administration screens.
- The product's scored scope is the two operations, four validation rules, six API routes, two standard screens, subscription controls, and required automation and infrastructure deliverables.

## Team and Repository

**Team:** Code Sapiens  
**Challenge:** Cloud and SaaS Engineering Challenges — Revision 2  
**Use case:** UC-05 — Automation Workload Preview SaaS

**Repository:** [Sahanaa77/uc05-Code-Sapiens](https://github.com/Sahanaa77/uc05-Code-Sapiens)

---

*WorkloadLens turns proposed automation jobs into validated, traceable workload previews while enforcing SaaS subscription and tenant boundaries.*
