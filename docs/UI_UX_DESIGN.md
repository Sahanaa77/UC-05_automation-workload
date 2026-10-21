# WorkloadLens — UI/UX Design & Specification Document

> **Product:** WorkloadLens (Automation Workload Preview SaaS)  
> **Use Case ID:** UC-05 | **Revision:** 2 | **Team:** Code Sapiens  
> **Target Framework:** React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons  
> **Specification Baseline:** `UC-05_automation-workload.docx`

---

## 1. Product Overview & Purpose

**WorkloadLens** is a multi-tenant SaaS application designed for automation engineering teams. It allows organizations to submit batches of proposed automation jobs, validate their parameters against strict business consistency rules (R1–R4), and generate deterministic effort estimates and execution previews before jobs are scheduled on compute workers.

### 1.1 Value Proposition by Subscription Tier
- **Basic Plan Customers:** Validate batch requests against schema, field bounds, and uniqueness rules (up to 3 accepted runs per UTC day).
- **Pro Plan Customers:** Perform validation and execute the preview processing engine, generating record-by-record estimated durations and batch summaries (up to 10 accepted runs per UTC day).

---

## 2. Navigation & Architecture

The application layout features a persistent left navigation sidebar and a main responsive content area:

```
+---------------------------------------------------------------------------------------+
|  WORKLOADLENS                         Current Tenant: Tenant A (Pro / Active)         |
+---------------------------------------------------------------------------------------+
|  [Sidebar Navigation]     |  [Main Content View]                                      |
|                           |                                                           |
|  * Run Tools (Active)     |  [Subscription & Quota Banner]                            |
|    - Batch Editor         |  Plan: Pro | Status: Active | Quota: 1/10 used (9 left)   |
|    - Validation Summary   |                                                           |
|    - Effort Preview       |  [Workload Batch Input]                                   |
|                           |  Presets: [Load Valid Fixture] [Load Invalid Fixture]     |
|  * Workload History       |  Interactive JSON / Row Editor                            |
|    - Tenant Run List      |                                                           |
|    - Run Detail Viewer    |  Actions: [Validate Workload]  [Generate Workload Preview]|
|                           |                                                           |
|                           |  [Results & Feedback Panel]                               |
+---------------------------------------------------------------------------------------+
```

---

## 3. Screen 1: Run Tools (`/tools` / Home)

### 3.1 Purpose & Role Capabilities
The primary execution workspace for submitting automation workload batches.
- **Operator Role:** Full interactive access to load presets, edit records, validate batches, and trigger processing previews.
- **Viewer Role:** Read-only inspection; execution buttons are disabled with tooltip notification: *"Viewer role cannot submit runs. Operator role required."*

### 3.2 Subscription & Daily Quota Header
- **Tenant Context Indicator:** Displays current tenant identity (`tenant-a` or `tenant-b`), plan name (`Basic` or `Pro`), and operational status (`active` or `suspended`).
- **Quota Usage Progress Bar:** Live visual progress indicator showing accepted runs used today versus daily UTC limit:
  - Green / Normal: < 70% of allowance used.
  - Amber / Warning: ≥ 70% used.
  - Red / Exhausted: 100% quota exhausted (e.g., `10 / 10 used`).
- **Suspension Notice:** If the tenant status is `suspended`, an alert banner is rendered:
  > **Subscription Suspended:** New workload submissions are disabled. Historical runs remain accessible in History.

### 3.3 Batch Input & Preset Controls
- **Fixture Fast-Load Controls:**
  - **Load Valid Fixture (2 Rows):** Immediately loads canonical test records:
    - Row 1: `record_id: "J01"`, `tool: "EXPORT"`, `record_count: 20`, `environment: "TEST"`
    - Row 2: `record_id: "J02"`, `tool: "VALIDATE"`, `record_count: 10`, `environment: "STAGE"`
  - **Load Invalid Fixture (6 Rows):** Loads canonical invalid batch containing all 4 rule violations (R1 duplicate `J01`, R2 invalid tool `DELETE`, R3 count `0`, R4 environment `PROD`).
  - **Clear:** Resets batch editor to empty state.
- **Table / JSON Editor:** Interactive table with live input cells and validation indicators:
  - `record_id` (String ≤ 20 chars)
  - `tool` (Select: `EXPORT` | `VALIDATE`)
  - `record_count` (Integer 1..1000)
  - `environment` (Select: `TEST` | `STAGE`)
- **Add / Remove Row Controls:** Allows adding up to 10 rows (strictly bounds-checked).

### 3.4 Action Controls
- **Validate Workload Button (Primary Outline):**
  - Sends `POST /runs` with `operation: "validate"`.
  - Available to both Basic and Pro plans.
  - Generates client-side UUID `Idempotency-Key`.
- **Generate Workload Preview Button (Primary Solid):**
  - Sends `POST /runs` with `operation: "process"`.
  - Pro Plan only. For Basic plan users, disabled with tooltip: *"Pro plan required for workload processing."*

---

## 4. Screen 2: Workload History (`/history`)

### 4.1 Purpose & Tenant Isolation
The operational audit log displaying all runs submitted by the authenticated tenant.
- **Strict Isolation:** The backend API filters records exclusively by the verified caller's tenant context (`GET /runs`). Tenant B never sees Tenant A's records.
- **Two-Column Master-Detail Layout:**
  - **Left Column (Run History Master List):** Chronological card list showing Run ID, Timestamp, Operation type (`validate` / `process`), and Status badge.
  - **Right Column (Selected Run Detail):** Full inspected result payload fetched via `GET /runs/{id}/result`.

### 4.2 Status Badge Semantics
- **Succeeded (Green Badge / Check Icon):** Run completed successfully. Displays validation issues or processed effort breakdown.
- **Failed (Red Badge / X Icon):** Terminal failure (e.g., A11 forced failure hook). Displays the recorded failure message without leaking server stack traces.
- **Running (Amber Badge / Spinner Icon):** Run currently executing or awaiting worker completion.

---

## 5. Validation Rules (R1–R4) & User Feedback

When a validation run completes or processing is evaluated, feedback is presented with granular 1-based row indexing and rule attribution:

| Rule | Specification Requirement | Inline Form Validation & Error Badge |
| :--- | :--- | :--- |
| **R1** | `record_id` is a non-empty string ≤ 20 characters, unique within batch. | Flagged with `Rule R1: Duplicate or invalid record ID`. Highlights subsequent duplicates while keeping first instance valid. |
| **R2** | `tool` must be `EXPORT` or `VALIDATE`. | Flagged with `Rule R2: Unsupported tool. Must be EXPORT or VALIDATE`. |
| **R3** | `record_count` must be integer 1 to 1000 inclusive (no booleans/strings). | Flagged with `Rule R3: Record count must be an integer between 1 and 1000`. |
| **R4** | `environment` must be `TEST` or `STAGE`. | Flagged with `Rule R4: Environment must be TEST or STAGE`. |

### 5.1 Validation Results View (`operation: validate`)
- **Metric Cards:**
  - **Valid Rows:** Count of conforming rows (e.g., `2` for valid fixture).
  - **Invalid Rows:** Count of rows with one or more rule failures (e.g., `4` for invalid fixture).
- **Issues Table:** Lists each violation:
  - `Row Index` (1-based)
  - `Field Name` (`record_id`, `tool`, `record_count`, `environment`)
  - `Violated Rule` (`R1`, `R2`, `R3`, `R4`)

### 5.2 Processing Preview View (`operation: process`)
- **Summary Header Cards:**
  - **Total Estimated Effort:** Formatted in milliseconds (e.g., `300 ms` for valid fixture).
  - **Input Rows:** Total processed jobs (`2 rows`).
  - **Total Records:** Aggregate item volume (`30 records`).
- **Detailed Execution Breakdown Table:**
  - `Record ID`: `J01` | Tool: `EXPORT` | Volume: `20 records` | Environment: `TEST` | **Estimated Time: 200 ms** (10 ms/record)
  - `Record ID`: `J02` | Tool: `VALIDATE` | Volume: `10 records` | Environment: `STAGE` | **Estimated Time: 100 ms** (10 ms/record)

---

## 6. System States & Visual Feedback

1. **Loading State:**
   - Buttons show animated spinning icon (`RefreshCw`).
   - Tables and metric cards render pulsing skeleton placeholders to prevent layout shift.
2. **Success State:**
   - Banner displays green check icon with Run ID, operation, and duration.
   - Quota counter dynamically increments without requiring full page refresh.
3. **Empty State:**
   - Workload History shows an illustration with text: *"No workload runs found for this tenant. Submit your first batch from Run Tools."*
4. **Rejection & Error States:**
   - **HTTP 400 (Invalid Process Input / Bounds):** Modal alert explaining that process operations reject batches containing invalid rows with zero quota debit.
   - **HTTP 403 (Permission / Plan Denial):** Explanatory banner distinguishing between Viewer read-only restrictions and Basic plan processing limitations.
   - **HTTP 409 (Idempotency Key Conflict):** Warning banner indicating that the submitted `Idempotency-Key` was previously used with different batch payload data.
   - **HTTP 429 (Daily Quota Exhausted):** Prominent notice stating that the daily UTC quota allowance has been reached and will reset at 00:00 UTC.

---

## 7. Accessibility & Technical Constraints

- **Keyboard Navigation:** Full tab order across navigation links, table input cells, preset buttons, and submission actions.
- **Color Contrast:** Conforms to WCAG AA guidelines with high-contrast text against dark backgrounds in status badges.
- **Deterministic Metrics Only:** In compliance with project guidelines, all displayed figures (states, ms, counts) reflect real computed or measured API values; no synthetic or randomized numbers are shown.
- **Tenant Context Security:** Tenant context is displayed read-only from the verified session; no editable tenant input fields exist in the interface.
