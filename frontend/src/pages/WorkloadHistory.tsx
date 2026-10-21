import React, { useState, useEffect } from 'react'
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle, Eye, FileText } from 'lucide-react'

interface RunSummary {
  run_id: string
  status: string
  operation: string
  result?: Record<string, unknown> | null
  error?: string | null
  created_at?: string | null
}

export const WorkloadHistory: React.FC = () => {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const token = 'Bearer token-tenant-a-operator'

  const fetchRuns = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/runs', {
        headers: { Authorization: token },
      })
      if (!res.ok) {
        setErrorMsg(`Failed to fetch history (HTTP ${res.status})`)
      } else {
        const data = await res.json()
        setRuns(data)
        if (data.length > 0 && !selectedRun) {
          fetchRunDetails(data[0].run_id)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Network error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchRunDetails = async (runId: string) => {
    try {
      const res = await fetch(`/runs/${runId}/result`, {
        headers: { Authorization: token },
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedRun(data)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Tenant Execution History</h1>
          <p className="text-xs text-muted mt-1">
            Isolated tenant historical runs, persistent results, and failure logs.
          </p>
        </div>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="px-3 py-1.5 bg-elevated hover:bg-surface border border-border rounded-lg text-xs font-medium text-text flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh History
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Main Grid: Runs List + Selected Run Result */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Runs Table */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5">
          <h2 className="text-xs font-semibold text-text uppercase tracking-wider mb-3">
            Execution Log ({runs.length} runs)
          </h2>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-elevated text-muted uppercase font-semibold text-[10px] border-b border-border">
                <tr>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Run ID</th>
                  <th className="px-3 py-2.5">Operation</th>
                  <th className="px-3 py-2.5">Created At (UTC)</th>
                  <th className="px-3 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-text">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted text-xs font-sans">
                      No runs recorded for this tenant yet. Execute a run from the Run Tools screen.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => {
                    const isSelected = selectedRun?.run_id === r.run_id
                    return (
                      <tr
                        key={r.run_id}
                        onClick={() => fetchRunDetails(r.run_id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10' : 'hover:bg-elevated/50'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          {r.status === 'Succeeded' && (
                            <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Succeeded
                            </span>
                          )}
                          {r.status === 'Failed' && (
                            <span className="inline-flex items-center gap-1 text-red-500 font-semibold text-[11px]">
                              <XCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          )}
                          {r.status === 'Running' && (
                            <span className="inline-flex items-center gap-1 text-blue-500 font-semibold text-[11px]">
                              <Clock className="w-3.5 h-3.5 animate-spin" /> Running
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-primary">
                          {r.run_id.substring(0, 8)}...
                        </td>
                        <td className="px-3 py-2.5 uppercase text-[11px] font-sans">
                          <span className="px-1.5 py-0.5 rounded bg-elevated border border-border">
                            {r.operation}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted text-[11px]">
                          {r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').substring(0, 19) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Eye className="w-4 h-4 inline-block text-muted hover:text-text" />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Selected Run Details */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-text uppercase tracking-wider pb-3 border-b border-border flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Run Details
          </h2>

          {selectedRun ? (
            <div className="space-y-4">
              <div className="p-3 bg-elevated rounded-lg space-y-2 text-xs">
                <div>
                  <span className="text-muted block text-[10px] uppercase font-semibold">Run ID</span>
                  <span className="font-mono text-text break-all font-semibold">{selectedRun.run_id}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Status</span>
                    <span className="font-bold text-text">{selectedRun.status}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Operation</span>
                    <span className="font-bold uppercase text-text">{selectedRun.operation}</span>
                  </div>
                </div>
              </div>

              {selectedRun.error ? (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">
                  <div className="font-bold text-[11px] uppercase mb-1">Recorded Error</div>
                  <p className="font-mono text-[11px]">{selectedRun.error}</p>
                </div>
              ) : selectedRun.result ? (
                <div>
                  <span className="text-muted block text-[10px] uppercase font-semibold mb-1">
                    Persisted Result JSON
                  </span>
                  <pre className="p-3 bg-elevated border border-border rounded-lg text-[11px] font-mono text-text overflow-x-auto max-h-80">
                    {JSON.stringify(selectedRun.result, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-4 text-center text-muted text-xs">No result data available.</div>
              )}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted text-xs text-center border border-dashed border-border rounded-lg">
              Select a run from the history table to inspect its persisted result.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
