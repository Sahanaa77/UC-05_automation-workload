export interface Tenant {
  id: string
  roles?: string[]
}

export interface Plan {
  features: string[]
  quota?: Record<string, number>
}

export interface Invariant {
  id: string
  type: string
  description?: string
}

export interface ModelDefinition {
  name: string
  tenants: Tenant[]
  feature_roles?: Record<string, string[]>
  plans: Record<string, Plan>
  transitions?: [string, string][]
  policies?: {
    grace_period_events?: number
    trial_events?: number
    prepaid_credits?: number
  }
  scenario: Array<{
    id: string
    tenant: string
    customer_id: string
    seq: number
    type: string
    payload: Record<string, any>
  }>
  invariants: Invariant[]
  unit?: string
  display?: { unit?: string }
}

export interface ModelRecord {
  id: string
  name: string
  definition: ModelDefinition
  created_at: string
}

export interface BoundsConfig {
  max_depth: number
  max_retries: number
  allow_duplicates: boolean
  allow_reorder: boolean
  allow_interrupt: boolean
  max_states: number
  max_concurrency: number
  seed: number
}

export interface RunProgress {
  states_explored: number
  violations: number
  elapsed_ms: number
  found: Array<{
    invariant_id: string
    tenant: string
    message: string
    step: number
  }>
}

export interface RunStats {
  states_explored: number
  violations: number
  duration_ms: number
  by_depth: Array<{ depth: number; states: number }>
  by_invariant: Record<string, number>
}

export interface StateDiff {
  step: number
  event: Record<string, any>
  expected: Record<string, any>
  observed: Record<string, any>
  is_offending?: boolean
  violation?: {
    id: string
    tenant?: string
    message: string
  }
}

export interface Counterexample {
  id: string
  run_id: string
  invariant_id: string
  original_trace: Array<Record<string, any>>
  minimal_trace?: Array<Record<string, any>>
  state_diffs?: StateDiff[]
  created_at: string
}

export interface Run {
  id: string
  run_id?: string
  model_id: string
  bounds: BoundsConfig
  fixed: boolean
  status: 'running' | 'done' | 'failed'
  progress?: RunProgress
  stats?: RunStats
  counterexamples: Counterexample[]
  created_at: string
}

export type StepId = 1 | 2 | 3 | 4 | 5 | 6

export interface StepInfo {
  id: StepId
  title: string
  path: string
}

// ============================================================================
// UC-05 Automation Workload Preview SaaS Types
// ============================================================================

export interface UC05JobRecord {
  record_id: string
  tool: 'EXPORT' | 'VALIDATE' | string
  record_count: number
  environment: 'TEST' | 'STAGE' | string
}

export interface UC05ValidationIssue {
  row_index: number
  field: string
  rule_id: 'R1' | 'R2' | 'R3' | 'R4' | string
}

export interface UC05ValidateResult {
  valid_rows: number
  invalid_rows: number
  issues: UC05ValidationIssue[]
}

export interface UC05ProcessSummary {
  input_rows: number
  total_records: number
  total_estimated_ms: number
}

export interface UC05ProcessRow {
  record_id: string
  estimated_ms: number
}

export interface UC05ProcessResult {
  summary: UC05ProcessSummary
  rows: UC05ProcessRow[]
  issues: UC05ValidationIssue[]
}

export interface UC05WorkloadRun {
  run_id: string
  status: 'Running' | 'Succeeded' | 'Failed' | string
  operation: 'validate' | 'process'
  result?: UC05ValidateResult | UC05ProcessResult | any
  error?: string | null
  created_at?: string
  http_status?: number
}

export interface UC05Subscription {
  tenant_id: string
  plan: 'Basic' | 'Pro'
  status: 'Active' | 'Suspended'
  daily_quota: number
  used_today: number
  remaining_quota: number
  daily_limit?: number
  remaining?: number
}

export interface UC05MockIdentity {
  token: string
  label: string
  tenantId: string
  role: 'Operator' | 'Viewer'
  plan: 'Basic' | 'Pro'
  status: 'Active' | 'Suspended'
}

