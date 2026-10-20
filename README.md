# EntitleSim

> Model-Based Verification & Counterexample Engine for SaaS Entitlement Workflows

EntitleSim is a developer workbench that systematically explores bounded event sequences (reordered webhooks, duplicated events, concurrent operations, and interrupted handlers), checks developer-defined entitlement and tenant-isolation invariants, minimizes failing traces into counterexamples using delta debugging, validates fixes, and exports reproducible regression tests for CI/CD.

---

## Architecture Diagram

The diagram below illustrates EntitleSim's logical verification pipeline, from model definition and in-memory exploration to counterexample minimization and deployment infrastructure.

```mermaid
flowchart TD
    %% ------------------------------------------------------------------------
    %% EntitleSim: Monochrome Architecture Diagram
    %% ------------------------------------------------------------------------

    subgraph INPUT ["1. Verification Input"]
        M_DEF["SaaS Model Definition: Tenants, Plans, Roles, Invariants"]
        M_BOUNDS["Exploration Bounds: Depth, Retries, Concurrency, Seed"]
        M_EVENTS["Initial Event Sequences: Subscription, Usage, Invoices"]
    end

    subgraph ENGINE ["2. Core Verification Engine (In-Memory)"]
        EXPLORER["Bounded Event Explorer: Permutations, Duplicates, Reordering"]
        ORACLE["Reference Oracle: Expected State Computation"]
        SUT["System Under Test: Handlers and Bug Flags"]
        INV_CHECK["Invariant Checker: Entitlements, Quotas, Tenant Isolation"]
    end

    subgraph DEBUGGING ["3. Results & Minimization"]
        VIOLATIONS["Invariant Violations Detected: Failing Event Traces"]
        MINIMIZER["Trace Minimizer: ddmin Delta Debugging Algorithm"]
        DIFF["State Diff Inspector: Expected vs Observed Transitions"]
        RETEST["Fix Validation: Re-Verification with fixed=True"]
        EXPORT["Regression Exporter: Generated pytest Files & CI Suite"]
    end

    subgraph APP ["4. Application & Persistence Layer"]
        UI["Frontend Dashboard: React 19, Stepper, State Machine Graph"]
        API["Backend REST API: FastAPI, Models, Runs, Counterexamples"]
        DB[("Database Storage: SQLite default or PostgreSQL JSONB")]
    end

    subgraph INFRA ["5. Build & Hosting Infrastructure"]
        GHA["GitHub Actions CI: Tests, Frontend Build, Container Image Build"]
        ACR["Azure Container Registry: uc05registry7bef65da.azurecr.io"]
        ACA["Azure Container App: workloadlens-api-dev on Port 8000"]
        BLOB["Azure Blob Storage: workloadlens-data (Private Container)"]
    end

    %% Verification Engine Flow
    INPUT --> EXPLORER
    EXPLORER --> ORACLE
    EXPLORER --> SUT
    ORACLE --> INV_CHECK
    SUT --> INV_CHECK

    %% Debugging and Minimization Flow
    INV_CHECK -->|Violations Found| VIOLATIONS
    VIOLATIONS --> MINIMIZER
    MINIMIZER --> DIFF
    DIFF --> RETEST
    RETEST --> EXPORT

    %% Application Layer Connections
    UI <-->|HTTP REST / Progress Polling| API
    API <-->|Durable Persistence| DB
    API <-->|In-Memory Execution| ENGINE
    API -.->|Fetch Counterexamples & Traces| DEBUGGING

    %% Build and Cloud Infrastructure Connections
    API -.->|Packaged via Dockerfile| GHA
    GHA -->|Build & Push Docker Image| ACR
    ACR -->|Container Image Pull on Deploy| ACA
    ACA -.->|Infrastructure Pre-requisite| BLOB

    %% Styling: Black outlines, white fill, black text
    classDef default fill:#ffffff,stroke:#000000,stroke-width:1.5px,color:#000000;
    classDef storage fill:#fcfcfc,stroke:#000000,stroke-width:1.5px,stroke-dasharray: 4 2,color:#000000;
    class DB,BLOB storage;
```

> **Note on Infrastructure Separation:**
> - **Verification Data Flow:** All verification states, runs, counterexamples, and regression exports are evaluated in-memory and persisted durably in the application database (SQLite default or PostgreSQL with JSONB).
> - **Azure Blob Storage (`workloadlens-data`):** Managed as an isolated cloud infrastructure dependency via Terraform; application verification results are stored in the database, not in Blob Storage.
> - **CI/CD Automation:** GitHub Actions runs backend tests, frontend builds, Terraform validation, and builds/pushes container images to Azure Container Registry (ACR). It does not automatically deploy; cloud deployments are operator-controlled via Terraform.

---

## Verification Pipeline

EntitleSim executes a five-stage verification lifecycle:

1. **Model & Bounds Ingestion**: Developers supply a declarative model containing tenant IDs, subscription tiers (`free`, `pro`), feature flags, role permissions, and formal invariants (`INV-1` feature access, `INV-2` usage quotas, `INV-3` cross-tenant isolation). Exploration bounds define maximum search depth, retry thresholds, concurrency interleavings, and random seed.
2. **Systematic State Exploration**: The in-memory Bounded Event Explorer systematically permutes event arrival orderings and injects duplicate webhooks. Each sequence is dispatched in parallel to both the Reference Oracle (calculating true expected state) and the System Under Test (SUT) with configurable bug toggles.
3. **Invariant Checking**: Invariants are evaluated across all tenants after each state transition. Any mismatch between expected and observed state triggers an invariant violation report with its complete trace.
4. **Counterexample Minimization (`ddmin`)**: Raw counterexample traces often contain non-essential noise events. The trace minimizer applies the Delta Debugging (`ddmin`) algorithm to discard irrelevant steps while preserving the failure, isolating canonical failure sequences (e.g., 4 steps for out-of-order plan upgrade/downgrade races).
5. **Fix Validation & Regression Export**: Developers validate fixes (`fixed=true`) through a re-verification pass ensuring zero invariant violations. EntitleSim exports standalone `pytest` test files and CI workflow definitions to prevent regressions.

---

## Quickstart

### Local Development (without Docker)

EntitleSim defaults to an embedded SQLite file database at `backend/entitlesim.db`:

```bash
task dev
```

This starts:
- **Web Dashboard**: [http://localhost:5173](http://localhost:5173)
- **API & Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Running the 1-Click Interactive Demo

Once `task dev` is running, open [http://localhost:5173](http://localhost:5173) in your browser and click **Run Demo** in the top navigation bar. EntitleSim will execute the 6-step workflow automatically:
1. **Model & Define**: Loads the sample SaaS model (2 tenants, feature tiers, 5 invariants).
2. **Bounded Exploration**: Permutes event orderings, captures states explored, and flags `INV-1` unauthorized access.
3. **Violation & Minimization**: Minimizes the trace to the canonical 4-step counterexample using `ddmin`.
4. **Inspect State Diff**: Highlights the offending transition on the state machine graph with side-by-side diffs.
5. **Fix & Retest**: Enables the fix (`fixed=true`) and runs a re-verification pass (0 violations).
6. **Regression Export**: Displays the generated self-contained `pytest` regression suite and CI configuration.

### Optional: Docker Compose (PostgreSQL)

If Docker is available, EntitleSim can run with PostgreSQL:

```bash
task up
# or
docker compose up --build
```

---

## Verification & Testing

```bash
# Run backend engine and API test suite (21 passed)
task test

# Seed the default SaaS models into the database
task seed

# Build frontend production bundle
cd frontend && npm run build
```

---

## Boundaries & Limitations

- **Model-Based Verification**: EntitleSim verifies the developer-defined state model or instrumented adapter, not arbitrary uninstrumented source code.
- **Bounded Exploration**: State exploration is finite and strictly bounded by user-configured depth, retry, and concurrency limits to guarantee termination.
- **Sandbox Environment**: All webhook and billing events are simulated locally; no live Stripe or external payment gateway transactions are performed.

---

## Cloud Deployment & Live Verification

Infrastructure as Code is managed under [`infra/`](infra/). For complete instructions, see the [`Deployment Runbook`](docs/deployment-runbook.md).

**Live Deployed Verification:**
- **Container App Endpoint:** `https://workloadlens-api-dev.ashyglacier-4fc4aa73.centralindia.azurecontainerapps.io/health`
- **Region:** `centralindia` (Resource Group: `rg-uc05-demo`, Environment: `uc05-env`)
- **Status:** Healthy (`HTTP 200 OK`, `{"status":"ok","version":"0.1.0"}`)

### Quick Deployment Path

```bash
# 1. Populate dev parameter file (do not commit secrets)
nano infra/environments/dev.tfvars

# 2. Export runtime secrets via environment variables
export TF_VAR_database_url="postgresql://user:pass@host:5432/entitlesim"  # or use SQLite default
export TF_VAR_acr_password=$(az acr credential show --name <acr> --query "passwords[0].value" -o tsv)

# 3. Deploy via helper script (runs preflight, plan, apply, and smoke test)
ENV=dev ./scripts/deploy.sh

# 4. Verify independently
FQDN=$(terraform -chdir=infra output -raw container_app_fqdn)
./scripts/verify.sh "${FQDN}"
```

### Deployment & CI Evidence

Verified deployment and CI artifacts are cataloged in [`evidence/README.md`](evidence/README.md):
- **Health Response**: [`evidence/health-response.json`](evidence/health-response.json) (HTTP 200 OK)
- **Live Headers**: [`evidence/verify-curl.txt`](evidence/verify-curl.txt) (Uvicorn server response)
- **Pre-Deploy Plan**: [`evidence/terraform-plan.txt`](evidence/terraform-plan.txt) (2 to add)
- **Apply Output**: [`evidence/terraform-apply.txt`](evidence/terraform-apply.txt) (2 added)
- **Idempotency Plan**: [`evidence/terraform-no-changes.txt`](evidence/terraform-no-changes.txt) (0 drift)
- **CI Pipeline**: [`evidence/ci-results.md`](evidence/ci-results.md) (All 4 GitHub Actions jobs succeeded)
