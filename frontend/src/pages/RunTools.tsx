import React, { useState, useEffect } from 'react'
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
  Layers,
  FileCheck2,
} from 'lucide-react'

interface SubscriptionInfo {
  tenant_id: string
  plan: string
  status: string
  daily_quota: number
  used_today: number
  remaining_quota: number
}

interface WorkloadRecord {
  record_id: string
  tool: string
  record_count: number
  environment: string
}

interface ValidationIssue {
  row_index: number
  field: string
  rule_id: string
}

interface ValidationResult {
  valid_rows: number
  invalid_rows: number
  issues: ValidationIssue[]
}

interface ProcessSummary {
  input_rows: number
  total_records: number
  total_estimated_ms: number
}

interface ProcessRowResult {
  record_id: string
  tool: string
  record_count: number
  environment: string
  estimated_ms: number
}

interface ProcessResult {
  summary: ProcessSummary
  rows: ProcessRowResult[]
  issues: ValidationIssue[]
}

const VALID_FIXTURE: WorkloadRecord[] = [
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
  { record_id: 'J02', tool: 'VALIDATE', record_count: 10, environment: 'STAGE' },
]

const INVALID_FIXTURE: WorkloadRecord[] = [
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
  { record_id: 'J02', tool: 'VALIDATE', record_count: 10, environment: 'STAGE' },
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
  { record_id: 'X2', tool: 'DELETE', record_count: 20, environment: 'TEST' },
  { record_id: 'X3', tool: 'EXPORT', record_count: 0, environment: 'TEST' },
  { record_id: 'X4', tool: 'EXPORT', record_count: 20, environment: 'PROD' },
]

export const RunTools: React.FC = () => {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [operation, setOperation] = useState<'validate' | 'process'>('validate')
  const [records, setRecords] = useState<WorkloadRecord[]>(VALID_FIXTURE)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null)
  const [lastRunId, setLastRunId] = useState<string | null>(null)

  // Use configured token or default to Tenant A Operator
  const token = 'Bearer token-tenant-a-operator'

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/subscription', {
        headers: { Authorization: token },
      })
      if (res.ok) {
        const data = await res.json()
        setSub(data)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchSubscription()
  }, [])

  const handleSubmit = async () => {
    setLoading(true)
    setErrorMsg(null)
    setValidationResult(null)
    setProcessResult(null)

    const idempotencyKey = `ui-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

    try {
      const res = await fetch('/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          operation,
          records,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.detail && typeof data.detail === 'object') {
          setErrorMsg(data.detail.message || JSON.stringify(data.detail))
          if (data.detail.issues) {
            setValidationResult({
              valid_rows: data.detail.valid_rows || 0,
              invalid_rows: data.detail.invalid_rows || 0,
              issues: data.detail.issues || [],
            })
          }
        } else {
          setErrorMsg(data.detail || `Server returned HTTP ${res.status}`)
        }
      } else {
        setLastRunId(data.run_id)
        if (data.operation === 'validate') {
          setValidationResult(data.result as ValidationResult)
        } else if (data.operation === 'process') {
          setProcessResult(data.result as ProcessResult)
        }
        await fetchSubscription()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Network or execution error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: SaaS Subscription & Quota */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text">Automation Workload Preview (UC-05)</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full">
              SaaS Engine
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Check automation jobs, validate parameters against rules R1–R4, and estimate workload effort.
          </p>
        </div>

        {sub && (
          <div className="flex items-center gap-4 bg-elevated px-4 py-2.5 rounded-lg border border-border">
            <div>
              <div className="text-[10px] text-muted uppercase font-semibold">Tenant Plan</div>
              <div className="text-sm font-bold text-text flex items-center gap-1.5">
                <span>{sub.plan}</span>
                <span className={`w-2 h-2 rounded-full ${sub.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
            </div>
            <div className="h-7 w-px bg-border" />
            <div>
              <div className="text-[10px] text-muted uppercase font-semibold">Daily Quota</div>
              <div className="text-sm font-bold text-text">
                {sub.remaining_quota} <span className="text-xs font-normal text-muted">/ {sub.daily_quota} left</span>
              </div>
            </div>
            <button
              onClick={fetchSubscription}
              className="p-1 hover:bg-surface rounded text-muted hover:text-text transition-colors"
              title="Refresh quota"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Form and Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Configuration */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-semibold text-text text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Workload Request
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecords(VALID_FIXTURE)}
                className="px-2.5 py-1 text-xs font-medium bg-elevated hover:bg-surface border border-border rounded-md text-text transition-colors cursor-pointer"
              >
                Load Valid (J01, J02)
              </button>
              <button
                type="button"
                onClick={() => setRecords(INVALID_FIXTURE)}
                className="px-2.5 py-1 text-xs font-medium bg-elevated hover:bg-surface border border-border rounded-md text-text transition-colors cursor-pointer"
              >
                Load Invalid (6 rows)
              </button>
            </div>
          </div>

          {/* Operation Selector */}
          <div>
            <label className="block text-xs font-medium text-text mb-1.5">Operation</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOperation('validate')}
                className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  operation === 'validate'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-surface text-muted hover:text-text'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                Validate Only
              </button>
              <button
                type="button"
                onClick={() => setOperation('process')}
                className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  operation === 'process'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-surface text-muted hover:text-text'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Validate &amp; Process (10 ms/rec)
              </button>
            </div>
          </div>

          {/* Records Table Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text">
                Batch Records ({records.length} / 10 rows)
              </label>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-elevated text-muted uppercase font-semibold text-[10px] border-b border-border">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Record ID (R1)</th>
                    <th className="px-3 py-2">Tool (R2)</th>
                    <th className="px-3 py-2">Count (R3)</th>
                    <th className="px-3 py-2">Env (R4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-text">
                  {records.map((r, i) => (
                    <tr key={i} className="hover:bg-elevated/40">
                      <td className="px-3 py-2 text-muted">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold">{r.record_id}</td>
                      <td className="px-3 py-2">{r.tool}</td>
                      <td className="px-3 py-2">{r.record_count}</td>
                      <td className="px-3 py-2">{r.environment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="w-full py-2.5 px-4 bg-primary text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Executing Run...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Submit Workload Run (POST /runs)
              </>
            )}
          </button>
        </div>

        {/* Right: Output & Results */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <h2 className="font-semibold text-text text-sm flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-primary" />
              Execution Output
            </h2>
            {lastRunId && (
              <span className="text-[10px] font-mono text-muted">Run ID: {lastRunId.substring(0, 8)}...</span>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Execution Rejected: </span>
                {errorMsg}
              </div>
            </div>
          )}

          {/* Validation Result Output */}
          {validationResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                  <div className="text-[10px] uppercase font-semibold text-green-600">Valid Rows</div>
                  <div className="text-xl font-bold text-green-700">{validationResult.valid_rows}</div>
                </div>
                <div className={`p-3 rounded-lg border text-center ${validationResult.invalid_rows > 0 ? 'bg-red-500/10 border-red-500/20 text-red-600' : 'bg-elevated border-border text-muted'}`}>
                  <div className="text-[10px] uppercase font-semibold">Invalid Rows</div>
                  <div className="text-xl font-bold">{validationResult.invalid_rows}</div>
                </div>
              </div>

              {validationResult.issues.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold text-text mb-2">Detected Rule Violations (R1–R4)</h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-elevated text-muted uppercase font-semibold text-[10px] border-b border-border">
                        <tr>
                          <th className="px-3 py-2">Row Index</th>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Rule ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono text-red-500">
                        {validationResult.issues.map((iss, i) => (
                          <tr key={i} className="hover:bg-red-500/5">
                            <td className="px-3 py-2 font-bold">Row {iss.row_index}</td>
                            <td className="px-3 py-2">{iss.field}</td>
                            <td className="px-3 py-2 font-bold">{iss.rule_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  All rows passed validation rules R1 through R4.
                </div>
              )}
            </div>
          )}

          {/* Process Result Output */}
          {processResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-elevated border border-border rounded-lg text-center">
                  <div className="text-[10px] text-muted uppercase font-semibold">Input Rows</div>
                  <div className="text-lg font-bold text-text">{processResult.summary.input_rows}</div>
                </div>
                <div className="p-3 bg-elevated border border-border rounded-lg text-center">
                  <div className="text-[10px] text-muted uppercase font-semibold">Total Records</div>
                  <div className="text-lg font-bold text-text">{processResult.summary.total_records}</div>
                </div>
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-center">
                  <div className="text-[10px] text-primary uppercase font-semibold">Total Estimated</div>
                  <div className="text-lg font-bold text-primary flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {processResult.summary.total_estimated_ms} ms
                  </div>
                </div>
              </div>

              {/* Rows Result Table */}
              <div>
                <h3 className="text-xs font-semibold text-text mb-2">Estimated Effort per Job</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-elevated text-muted uppercase font-semibold text-[10px] border-b border-border">
                      <tr>
                        <th className="px-3 py-2">Job ID</th>
                        <th className="px-3 py-2">Tool</th>
                        <th className="px-3 py-2">Records</th>
                        <th className="px-3 py-2">Environment</th>
                        <th className="px-3 py-2 text-right">Estimated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-text">
                      {processResult.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-elevated/40">
                          <td className="px-3 py-2 font-bold text-primary">{r.record_id}</td>
                          <td className="px-3 py-2">{r.tool}</td>
                          <td className="px-3 py-2">{r.record_count}</td>
                          <td className="px-3 py-2">{r.environment}</td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{r.estimated_ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!validationResult && !processResult && !errorMsg && (
            <div className="h-64 flex flex-col items-center justify-center text-muted border border-dashed border-border rounded-xl text-center p-6">
              <FileCheck2 className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs font-medium">Ready to validate or preview workload.</p>
              <p className="text-[11px] mt-1 max-w-xs">
                Select your parameters and click Submit to run live against the FastAPI backend.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
