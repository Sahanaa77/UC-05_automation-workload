# WorkloadLens UC-05 — References and Design Rationale

> **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Team:** Code Sapiens  
> **Context:** Architectural references, engineering standards, and implementation rationale.

---

## 1. Overview & Architectural Philosophy

WorkloadLens is built on established software engineering principles, multitenant cloud architecture standards, and formal HTTP semantics. This document records the core technical references that guided the design of tenant boundaries, concurrency controls, idempotent execution, and infrastructure boundaries.

Each reference below details:
1. **Relevant concept**: The engineering principle in the context of system architecture.
2. **Application in WorkloadLens**: The exact component, rule, test, or design decision implementing the concept.
3. **Limitation**: The explicit operational boundaries of this project (distinguishing educational relevance from implemented scope).

---

## 2. Technical References & Implementation Mapping

### 2.1 Fowler et al. — Patterns of Enterprise Application Architecture (2002)

* **Citation:** Martin Fowler, with contributions by David Rice, Matthew Foemmel, Edward Hieatt, Robert Mee, and Randy Stafford. *Patterns of Enterprise Application Architecture*. Addison-Wesley, 2002.
* **Official URL:** [https://martinfowler.com/books/eaa.html](https://martinfowler.com/books/eaa.html)
* **Pattern Catalog:** [https://martinfowler.com/eaaCatalog/](https://martinfowler.com/eaaCatalog/)

#### Relevant Concept
Separation of Concerns between business logic, data mapping, and transactional boundaries. Fowler defines patterns such as *Data Mapper* and *Repository* (isolating domain logic from relational database representations) and *Transaction Script* / *Unit of Work* (grouping atomic business actions into consistent database transactions).

#### Application in WorkloadLens
- **Decoupled Validation Engine**: The batch validation engine in `backend/app/main.py` evaluates business constraints (R1 duplicate check, R2 tool whitelist, R3 record volume bounds, R4 environment verification) as pure functions independently of database persistence.
- **Data Mapping**: In `backend/app/models.py`, persistence is mediated by SQLAlchemy declarative models (`RunModel`, `DailyUsageModel`, `SubscriptionModel`), abstracting SQL dialect differences between local SQLite testing and PostgreSQL in cloud staging.
- **Atomic Transactions**: Run lifecycle management encapsulates quota debiting and initial run creation within a single transactional unit to prevent orphaned run records.
- **Verification**: Verified across unit validation tests (`backend/tests/test_validation.py`) and execution flow tests (`backend/tests/test_runs_flow.py`).

#### Limitation
WorkloadLens does not implement a heavyweight enterprise Domain Model pattern with rich entity inheritance hierarchies or distributed transaction managers (2PC/XA). It relies on Python dataclasses and SQLAlchemy ORM models suited for high-throughput REST microservices.

---

### 2.2 Kleppmann — Designing Data-Intensive Applications (2017)

* **Citation:** Martin Kleppmann. *Designing Data-Intensive Applications: The Big Ideas Behind Reliable, Scalable, and Maintainable Systems*. O'Reilly Media, 2017.
* **Official URL:** [https://dataintensive.net/](https://dataintensive.net/)

#### Relevant Concept
Consequences of concurrency, race conditions, and write-loss in relational datastores. Kleppmann highlights the vulnerability of naive "read-modify-write" cycles under concurrent access and establishes the importance of atomic compare-and-swap/conditional updates, persistent state machines, and safe idempotent replays.

#### Application in WorkloadLens
- **Atomic Quota Reservation**: To prevent race conditions where concurrent requests exceed a tenant's daily quota (e.g., Basic plan limit of 3 runs/day), `backend/app/main.py` executes a single atomic SQL statement:
  ```sql
  UPDATE "DailyUsage"
  SET count = count + 1
  WHERE tenant_id = :tenant_id AND usage_date = :today AND count < :max_limit;
  ```
  Only if the row count modified equals 1 is quota granted; otherwise, `HTTP 429 Too Many Requests` is returned.
- **Deterministic Payload Fingerprinting**: Computes a SHA-256 hash of the canonicalized input payload to detect replays versus payload mutations.
- **Verification**: Verified under multithreaded concurrent competition in `backend/tests/test_uc05_acceptance.py::test_a08_basic_quota_and_concurrency`.

#### Limitation
WorkloadLens executes on a single shared relational database instance. It does not implement distributed consensus protocols (Raft, Paxos), multi-partition transactional coordination, or distributed log replication (Apache Kafka) discussed in advanced chapters of the text.

---

### 2.3 Microsoft Azure Architecture Center — Multitenant Solutions Architecture

* **Citation:** Microsoft Azure Architecture Center. *Architect Multitenant Solutions on Azure*. Microsoft Learn.
* **Official URL:** [https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)

#### Relevant Concept
Architectural patterns for SaaS multitenancy, trusted security boundaries, and tenant isolation models. A fundamental principle of multitenant security is that tenant identity must be derived exclusively from cryptographically authenticated credentials rather than user-supplied request parameters or headers.

#### Application in WorkloadLens
- **Strict Tenant Context Propagation**: In `backend/app/main.py`, `get_identity` and `get_current_tenant` resolve the active tenant (`tenant_id`), role (`Operator`, `Viewer`), and plan (`Basic`, `Pro`) solely from the validated Bearer token.
- **Anti-Impersonation Safeguards**: WorkloadLens rejects any incoming request containing tenant override mechanisms (such as `X-Tenant-Override` headers or `tenant_id` fields in JSON bodies) with `HTTP 400 Bad Request`.
- **Row-Level Tenant Boundary**: Every database query on `Runs` and `DailyUsage` explicitly filters by `tenant_id = :tenant_id`. Historical inspection (`GET /runs/{id}/result`) returns `HTTP 404 Not Found` if a tenant attempts to inspect another tenant's run ID.
- **Verification**: Confirmed via `backend/tests/test_uc05_acceptance.py::test_a07_cross_tenant_isolation`.

#### Limitation
WorkloadLens implements a shared-application, shared-database (multitenant pooled) model with row-level filtering rather than deploying dedicated isolated databases or dedicated container apps per tenant.

---

### 2.4 IETF RFC 9110 — HTTP Semantics, Section 9.2.2: Idempotent Methods (2022)

* **Citation:** Roy T. Fielding, Mark Nottingham, and Julian Reschke (Editors). *RFC 9110: HTTP Semantics*, Section 9.2.2: "Idempotent Methods". Internet Engineering Task Force (IETF), June 2022.
* **Official URL:** [https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)

#### Relevant Concept
Formal definition of HTTP idempotency: a request method is considered idempotent if the intended effect on the server of multiple identical requests with that method is the same as the effect for a single request. Although `POST` is non-idempotent by default in HTTP specifications, application-level idempotency headers allow clients to safely retry requests across unreliable networks without unintended duplication.

#### Application in WorkloadLens
- **Application-Level Idempotency (`Idempotency-Key`)**: WorkloadLens mandates the `Idempotency-Key` header on `POST /runs`.
- **Replay Behavior**: If a request arrives with an identical key and matching payload fingerprint for the authenticated tenant:
  - The server returns the previously persisted run record with `HTTP 200 OK`.
  - Zero additional daily quota is consumed, even if the tenant has exhausted their daily allotment.
- **Conflict Handling**: If the same `Idempotency-Key` is reused with a modified payload fingerprint, the server returns `HTTP 409 Conflict`.
- **Deterministic HTTP Status Codes**: WorkloadLens strictly observes RFC 9110 status codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `429 Too Many Requests`).
- **Verification**: Verified via `backend/tests/test_uc05_acceptance.py::test_a09_idempotency_replay_same_and_different_key`.

#### Limitation
WorkloadLens enforces idempotency at the database row level scoped to each tenant. It does not implement automated distributed client cache-control directives or the experimental IETF draft specifications for distributed in-flight request deduplication.

---

### 2.5 HashiCorp — Terraform Recommended Practices

* **Citation:** HashiCorp. *Terraform Recommended Practices & Style Guide*. HashiCorp Developer Documentation.
* **Official URL:** [https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices](https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices)
* **Configuration Style Guide:** [https://developer.hashicorp.com/terraform/language/style](https://developer.hashicorp.com/terraform/language/style)

#### Relevant Concept
Principles of Infrastructure as Code (IaC): declarative configuration, deterministic convergence, minimal blast radius, modular separation of managed infrastructure from existing dependencies, and zero configuration drift.

#### Application in WorkloadLens
- **Minimal Blast Radius**: The Terraform configuration in `infra/main.tf` strictly manages exactly two target resources:
  1. `azurerm_container_app.api` (WorkloadLens container app).
  2. `azurerm_storage_container.data` (Private blob container).
- **Separation of Preconditions via Data Sources**: Shared external dependencies—such as the Azure Resource Group (`rg-uc05-demo`), Azure Container Registry, and Container Apps Environment—are referenced via Terraform data sources or runtime variables rather than created or destroyed by this module.
- **Zero Drift Validation**: Verified with `terraform -chdir=infra validate` and `terraform plan -detailed-exitcode` confirming 0 resources to add, change, or destroy on repeat runs.
- **Verification**: Documented in `evidence/terraform-no-changes.txt`.

#### Limitation
WorkloadLens defaults to local state tracking (`terraform.tfstate`) for standalone evaluation simplicity, while providing migration guidance in `docs/deployment-runbook.md` for team-based Azure Storage remote state backends. It does not employ automated Terraform Cloud VCS workspaces.

---

## 3. Summary Mapping Matrix

| Technical Concern | Primary Reference | Implementation File | Verification Test | Scope Boundary |
|---|---|---|---|---|
| **Separation of Concerns & Persistence** | Fowler et al. (2002) | `backend/app/main.py`<br/>`backend/app/models.py` | `test_validation.py`<br/>`test_runs_flow.py` | ORM & pure functions; no enterprise distributed transaction manager. |
| **Concurrency & Atomic Quota** | Kleppmann (2017) | `backend/app/main.py` | `test_a08_basic_quota_and_concurrency` | Atomic SQL updates on single DB; no distributed Paxos/Raft. |
| **Tenant Isolation & Security Boundary** | Microsoft Azure Architecture Center | `backend/app/main.py` | `test_a07_cross_tenant_isolation` | Shared DB with row filtering; no isolated DB per tenant. |
| **Idempotency & HTTP Contracts** | IETF RFC 9110 (2022) | `backend/app/main.py` | `test_a09_idempotency_replay_same_and_different_key` | Application-level header; DB-scoped replay. |
| **IaC Scope & Blast Radius** | HashiCorp Recommended Practices | `infra/main.tf`<br/>`infra/variables.tf` | `terraform validate` | Exactly 2 managed resources; external resources via data sources. |
