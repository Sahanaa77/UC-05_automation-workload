import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { UC05WorkloadRun, UC05JobRecord } from '../types'
import {
  getWorkloadRuns,
  getWorkloadRunResult,
  createWorkloadRun,
  ApiError,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import {
  Card,
  Badge,
  BadgeVariant,
  Button,
  Stat,
  Skeleton,
  EmptyState,
  Tabs,
  useToast,
  PageHeader,
} from '../components/ui'
import { analyzeValidateResult, analyzeProcessResult } from '../lib/advisor'
import { exportCsv } from '../lib/exportUtils'
import {
  History,
  Play,
  RotateCcw,
  Search,
  Copy,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Eye,
  ShieldAlert,
  BarChart3,
  ListOrdered,
  Layers,
  Sparkles,
  TrendingUp,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Scale,
  CheckSquare,
  Square,
  Percent,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

function formatUtc(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function formatRelative(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function getRecordsCount(run: UC05WorkloadRun): string | number {
  if (!run.result) return '—'
  if (run.operation === 'process') {
    return run.result.summary?.input_rows ?? run.result.rows?.length ?? '—'
  }
  if (run.operation === 'validate') {
    const valid = run.result.valid_rows
    const invalid = run.result.invalid_rows
    if (typeof valid === 'number' && typeof invalid === 'number') {
      return valid + invalid
    }
    return run.result.issues?.length !== undefined ? `${run.result.issues.length} issues` : '—'
  }
  return '—'
}

function getEstimatedMs(run: UC05WorkloadRun): number {
  if (run.result?.summary?.total_estimated_ms !== undefined) {
    return Number(run.result.summary.total_estimated_ms) || 0
  }
  if (run.result?.rows && Array.isArray(run.result.rows)) {
    return run.result.rows.reduce(
      (acc: number, row: any) => acc + (Number(row.estimated_ms) || 0),
      0
    )
  }
  return 0
}

export const WorkloadAdvisor: React.FC<{
  operation: 'validate' | 'process' | string
  result: any
  className?: string
}> = ({ operation, result, className = '' }) => {
  if (!result) return null

  if (operation === 'validate') {
    const advice = analyzeValidateResult(result)
    if (!advice) return null

    return (
      <Card
        className={`border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-950 p-5 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-indigo-100/70 dark:border-indigo-900/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Workload Advisor</h3>
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Smart insights - rule-based
              </p>
            </div>
          </div>
          <Badge
            variant={
              advice.readinessScore === 100
                ? 'success'
                : advice.readinessScore >= 50
                ? 'warn'
                : 'danger'
            }
            className="text-xs px-2.5 py-1"
          >
            {advice.readinessScore}% Readiness
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border shadow-2xs">
          <div className="text-xs text-text-secondary">
            <span className="font-semibold text-text">Batch Health: </span>
            {advice.summarySentence}
          </div>
          <div className="text-right text-[11px] font-mono text-muted whitespace-nowrap ml-3">
            {advice.validRows}/{advice.totalRows} valid
          </div>
        </div>

        {advice.ruleInsights.length > 0 ? (
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
              Recommended Fixes by Rule
            </div>
            <div className="space-y-2">
              {advice.ruleInsights.map((ins) => (
                <div
                  key={ins.ruleId}
                  className="p-3 rounded-lg bg-surface border border-border text-xs space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-text">
                      <Badge variant="danger" className="text-[10px]">
                        {ins.ruleId}
                      </Badge>
                      <span>{ins.ruleTitle}</span>
                    </div>
                    <span className="text-[10px] text-muted font-mono">
                      Affects {ins.count} row{ins.count > 1 ? 's' : ''} (Rows {ins.affectedRows.join(', ')})
                    </span>
                  </div>
                  <p className="text-text-secondary text-[11px]">{ins.explanation}</p>
                  <div className="flex items-start gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 p-2 rounded border border-emerald-100 dark:border-emerald-900 font-medium">
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong>Concrete fix:</strong> {ins.concreteFix}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>Ready to process. No validation rule violations found in batch.</span>
          </div>
        )}
      </Card>
    )
  }

  if (operation === 'process') {
    const advice = analyzeProcessResult(result)
    if (!advice) return null

    return (
      <Card
        className={`border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 via-surface to-surface-muted dark:from-indigo-950/20 dark:via-surface dark:to-surface p-5 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-indigo-100/70 dark:border-indigo-900/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">Workload Advisor</h3>
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Smart insights - rule-based
              </p>
            </div>
          </div>
          <Badge
            variant={
              advice.effortLevel === 'Low'
                ? 'success'
                : advice.effortLevel === 'Medium'
                ? 'info'
                : 'warn'
            }
            className="text-xs px-2.5 py-1"
          >
            {advice.effortLevel} Effort ({advice.totalEstimatedMs} ms)
          </Badge>
        </div>

        <div className="p-3 rounded-lg bg-surface border border-border text-xs text-text-secondary space-y-1 shadow-2xs">
          <div className="flex items-center gap-1.5 font-semibold text-text">
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Effort Level: {advice.effortLevel}
          </div>
          <p className="text-[11px] text-muted">{advice.effortDescription}</p>
        </div>

        {advice.heaviestJob && (
          <div className="p-3 rounded-lg bg-surface border border-border text-xs space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Heaviest Job
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">
                {advice.heaviestJob.sharePercent}% of total
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-text text-[11px]">
              <span className="font-semibold">Record ID: {advice.heaviestJob.record_id}</span>
              <span className="text-muted">{advice.heaviestJob.estimated_ms} ms</span>
            </div>
          </div>
        )}

        {advice.rowsShare.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Share of Execution Time per Record
            </div>
            <div className="p-3 rounded-lg bg-surface border border-border space-y-2 shadow-2xs">
              {advice.rowsShare.map((r, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.record_id}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {r.estimated_ms} ms ({r.sharePercent}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, r.sharePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Teaching rule note:</strong> {advice.teachingRuleNote}
          </span>
        </div>
      </Card>
    )
  }

  return null
}

export const WorkloadHistory: React.FC = () => {
  const { token, activeTokenOption } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [runs, setRuns] = useState<UC05WorkloadRun[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isReRunning, setIsReRunning] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)

  // Filters synced to URL hash query parameters
  const statusFilter = searchParams.get('status') || 'All'
  const operationFilter = searchParams.get('operation') || 'All'
  const [searchId, setSearchId] = useState<string>(() => searchParams.get('search') || '')

  useEffect(() => {
    const q = searchParams.get('search')
    if (q !== null && q !== searchId) {
      setSearchId(q)
    }
  }, [searchParams])

  // Pagination state (10 per page)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 10

  // Sortable columns state
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Compare Two Runs state
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false)

  // Selected run state
  const [selectedRun, setSelectedRun] = useState<UC05WorkloadRun | null>(null)
  const [drawerDetail, setDrawerDetail] = useState<UC05WorkloadRun | null>(null)
  const [isDrawerLoading, setIsDrawerLoading] = useState<boolean>(false)
  const [drawerTab, setDrawerTab] = useState<string>('summary')

  // Copied Run ID state for quick inline feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // URL Hash Filter Handlers
  const handleStatusFilterChange = (newStatus: string) => {
    const next = new URLSearchParams(searchParams)
    if (newStatus === 'All') next.delete('status')
    else next.set('status', newStatus)
    setSearchParams(next, { replace: true })
    setCurrentPage(1)
  }

  const handleOperationFilterChange = (newOp: string) => {
    const next = new URLSearchParams(searchParams)
    if (newOp === 'All') next.delete('operation')
    else next.set('operation', newOp)
    setSearchParams(next, { replace: true })
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    next.delete('operation')
    setSearchParams(next, { replace: true })
    setSearchId('')
    setCurrentPage(1)
  }

  const loadRuns = useCallback(async (silent: boolean = false) => {
    if (!silent) setIsLoading(true)
    setErrorMessage(null)
    try {
      const data = await getWorkloadRuns(token)
      setRuns(data)
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage(err.message || 'Failed to load runs history.')
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [token])

  // 1) IDENTITY REFRESH BUG FIX:
  // On identity change: clear last results, show skeletons, refetch /runs
  useEffect(() => {
    setRuns([])
    setIsLoading(true)
    setErrorMessage(null)
    setSelectedRun(null)
    setDrawerDetail(null)
    setSelectedForCompare([])
    loadRuns(false)
  }, [token, loadRuns])

  // Auto-select first run when runs are loaded
  useEffect(() => {
    if (!selectedRun && runs.length > 0) {
      handleOpenDrawer(runs[0])
    }
  }, [runs, selectedRun])

  useEffect(() => {
    document.title = 'Workload History | WorkloadLens'
  }, [])

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      loadRuns(true)
    }, 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, loadRuns])

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCompareModalOpen) {
        setIsCompareModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCompareModalOpen])

  // Select run and fetch run detail
  const handleOpenDrawer = async (run: UC05WorkloadRun) => {
    setSelectedRun(run)
    setDrawerDetail(null)
    setDrawerTab('summary')
    setIsDrawerLoading(true)

    try {
      const detail = await getWorkloadRunResult(run.run_id, token)
      setDrawerDetail(detail)
    } catch {
      setDrawerDetail(run)
    } finally {
      setIsDrawerLoading(false)
    }
  }

  const handleCopy = async (e: React.MouseEvent, text: string, label: string = 'Run ID') => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(text)
      toast(`${label} copied`, text, 'info')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast('Copy failed', 'Clipboard access denied', 'error')
    }
  }

  // Workload Re-run & Replay handlers
  const getRunInputRecords = (run: UC05WorkloadRun): { records: UC05JobRecord[]; operation: 'validate' | 'process'; key: string } => {
    const saved = localStorage.getItem(`run_input_${run.run_id}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.records && Array.isArray(parsed.records) && parsed.records.length > 0) {
          return {
            records: parsed.records,
            operation: (parsed.operation as any) || run.operation,
            key: parsed.idempotencyKey || run.run_id,
          }
        }
      } catch {}
    }

    let recs: UC05JobRecord[] = []
    if (run.result?.rows && Array.isArray(run.result.rows) && run.result.rows.length > 0) {
      recs = run.result.rows.map((r: any) => ({
        record_id: r.record_id || 'J01',
        tool: 'EXPORT',
        record_count: 10,
        environment: 'TEST',
      }))
    } else {
      recs = [
        { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
        { record_id: 'J02', tool: 'VALIDATE', record_count: 10, environment: 'STAGE' },
      ]
    }

    return {
      records: recs,
      operation: run.operation,
      key: run.run_id,
    }
  }

  const handleReplaySameKey = async (run: UC05WorkloadRun) => {
    const input = getRunInputRecords(run)
    setIsReRunning(true)
    try {
      const res = await createWorkloadRun(input.operation, input.records, input.key, token)
      toast(
        'Replay Cached (HTTP 200 OK)',
        `Idempotent replay recognized. No quota debited.`,
        'success'
      )
      await loadRuns(false)
      handleOpenDrawer(res)
    } catch (err: any) {
      toast('Replay Failed', err.message || 'Could not replay workload', 'error')
    } finally {
      setIsReRunning(false)
    }
  }

  const handleRerunNewKey = async (run: UC05WorkloadRun) => {
    const input = getRunInputRecords(run)
    const newKey = crypto.randomUUID()
    setIsReRunning(true)
    try {
      const res = await createWorkloadRun(input.operation, input.records, newKey, token)
      toast(
        'New Run Executed (HTTP 201)',
        `Run ID: ${res.run_id}`,
        'success'
      )
      if (res.run_id) {
        try {
          localStorage.setItem(
            `run_input_${res.run_id}`,
            JSON.stringify({
              records: input.records,
              operation: input.operation,
              idempotencyKey: newKey,
            })
          )
        } catch {}
      }
      await loadRuns(false)
      handleOpenDrawer(res)
    } catch (err: any) {
      toast('Run Failed', err.message || 'Could not execute workload', 'error')
    } finally {
      setIsReRunning(false)
    }
  }

  const handleOpenInBuilder = (run: UC05WorkloadRun) => {
    const input = getRunInputRecords(run)
    sessionStorage.setItem(
      'workload_builder_preload',
      JSON.stringify({
        records: input.records,
        operation: input.operation,
      })
    )
    navigate('/tools')
  }

  // 1. KPI STRIP COMPUTATIONS (computed from loaded runs)
  const kpis = useMemo(() => {
    const totalRuns = runs.length
    let succeededCount = 0
    let failedCount = 0
    let totalEstimatedMs = 0

    runs.forEach((r) => {
      const s = r.status.toLowerCase()
      if (s === 'succeeded') succeededCount++
      else if (s === 'failed') failedCount++
      totalEstimatedMs += getEstimatedMs(r)
    })

    const successRate = totalRuns > 0 ? Math.round((succeededCount / totalRuns) * 100) : 0

    return {
      totalRuns,
      succeededCount,
      failedCount,
      successRate,
      totalEstimatedMs,
    }
  }, [runs])

  // 2. RUNS BY DAY BAR CHART
  const runsByDayData = useMemo(() => {
    if (!runs.length) return []
    const dayMap = new Map<string, { date: string; displayDate: string; total: number; succeeded: number; failed: number }>()

    const sortedRuns = [...runs].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0
      const db = b.created_at ? new Date(b.created_at).getTime() : 0
      return da - db
    })

    sortedRuns.forEach((r) => {
      if (!r.created_at) return
      const d = new Date(r.created_at)
      if (isNaN(d.getTime())) return
      const dayKey = d.toISOString().slice(0, 10) // YYYY-MM-DD
      const displayDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const item = dayMap.get(dayKey) || { date: dayKey, displayDate, total: 0, succeeded: 0, failed: 0 }
      item.total++
      if (r.status.toLowerCase() === 'succeeded') item.succeeded++
      else if (r.status.toLowerCase() === 'failed') item.failed++
      dayMap.set(dayKey, item)
    })

    return Array.from(dayMap.values())
  }, [runs])

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (!r) return false
      const rStatus = (r.status || '').toLowerCase()
      const rOp = (r.operation || '').toLowerCase()
      const rId = (r.run_id || '').toLowerCase()

      if (statusFilter !== 'All' && rStatus !== statusFilter.toLowerCase()) {
        return false
      }
      if (operationFilter !== 'All' && rOp !== operationFilter.toLowerCase()) {
        return false
      }
      if (searchId.trim() && !rId.includes(searchId.trim().toLowerCase())) {
        return false
      }
      return true
    })
  }, [runs, statusFilter, operationFilter, searchId])

  // Sort toggle handler
  const handleSortToggle = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  // Sorted and Filtered Runs
  const sortedAndFilteredRuns = useMemo(() => {
    return [...filteredRuns].sort((a, b) => {
      let cmp = 0
      if (sortField === 'created_at') {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0
        const db = b.created_at ? new Date(b.created_at).getTime() : 0
        cmp = da - db
      } else if (sortField === 'run_id') {
        cmp = a.run_id.localeCompare(b.run_id)
      } else if (sortField === 'operation') {
        cmp = a.operation.localeCompare(b.operation)
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status)
      } else if (sortField === 'records') {
        const ca = typeof getRecordsCount(a) === 'number' ? (getRecordsCount(a) as number) : 0
        const cb = typeof getRecordsCount(b) === 'number' ? (getRecordsCount(b) as number) : 0
        cmp = ca - cb
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [filteredRuns, sortField, sortOrder])

  // Paginated runs (10 per page)
  const totalPages = Math.max(1, Math.ceil(sortedAndFilteredRuns.length / pageSize))
  const paginatedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedAndFilteredRuns.slice(start, start + pageSize)
  }, [sortedAndFilteredRuns, currentPage, pageSize])

  // Reset page if out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  // Export Filtered List to CSV
  const handleExportFilteredCsv = () => {
    const headers = [
      'Run ID',
      'Tenant',
      'Operation',
      'Status',
      'Records Count',
      'Estimated Effort (ms)',
      'Created At (UTC)',
      'Error',
    ]
    const rows = sortedAndFilteredRuns.map((r) => [
      r.run_id,
      activeTokenOption.tenant,
      r.operation,
      r.status,
      getRecordsCount(r),
      getEstimatedMs(r),
      r.created_at || '',
      r.error || '',
    ])
    const tenantSlug = activeTokenOption.tenant.toLowerCase().replace(/[^a-z0-9]/g, '_')
    exportCsv(`workload_runs_${tenantSlug}`, headers, rows)
    toast('CSV Exported', `Exported ${sortedAndFilteredRuns.length} runs to CSV`, 'info')
  }

  // Compare Two Runs selection logic
  const handleToggleCompare = (e: React.MouseEvent, runId: string) => {
    e.stopPropagation()
    setSelectedForCompare((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId)
      }
      if (prev.length >= 2) {
        toast('Comparison Updated', 'Replaced the earlier selected run with the new selection', 'info')
        return [prev[1], runId]
      }
      return [...prev, runId]
    })
  }

  const runA = useMemo(() => {
    return runs.find((r) => r.run_id === selectedForCompare[0]) || null
  }, [runs, selectedForCompare])

  const runB = useMemo(() => {
    return runs.find((r) => r.run_id === selectedForCompare[1]) || null
  }, [runs, selectedForCompare])

  // Chart data for process run in drawer
  const activeDetail = drawerDetail || selectedRun
  const chartData = useMemo(() => {
    if (activeDetail?.operation !== 'process' || !activeDetail.result?.rows) return []
    return (activeDetail.result.rows as Array<{ record_id: string; estimated_ms: number }>).map(
      (row) => ({
        name: row.record_id,
        estimated_ms: row.estimated_ms,
      })
    )
  }, [activeDetail])

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    const s = status.toLowerCase()
    if (s === 'succeeded') return 'success'
    if (s === 'failed') return 'danger'
    if (s === 'running') return 'info'
    return 'default'
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Role / Subscription Notices */}
      {activeTokenOption.role === 'Viewer' && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[13px] flex items-center gap-2.5">
          <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <strong className="font-semibold">Notice:</strong> Read-only (Viewer) &mdash; execution
            is disabled, but historical workload execution logs remain accessible.
          </div>
        </div>
      )}

      {activeTokenOption.status === 'Suspended' && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-[13px] flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <div>
            <strong className="font-semibold">Notice:</strong> Subscription suspended - history is still readable. Upgrade or reactivate to resume automation processing.
          </div>
        </div>
      )}

      <PageHeader
        title="Execution History"
        description={`Recorded workload runs for tenant ${activeTokenOption.tenant}.`}
        icon={<History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        breadcrumbs={[
          { label: 'WorkloadLens', href: '#/tools' },
          { label: 'Execution History' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-1.5"
            >
              <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
              Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => loadRuns(false)}
              isLoading={isLoading}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* 1. KPI STRIP (4 METRICS COMPUTED FROM LOADED RUNS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Runs */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Runs
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 font-mono">
              {kpis.totalRuns}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Across all recorded history
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </Card>

        {/* KPI 2: Success Rate */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Success Rate
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 font-mono flex items-center gap-1.5">
              {kpis.successRate}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {kpis.succeededCount} succeeded runs
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Percent className="w-5 h-5" />
          </div>
        </Card>

        {/* KPI 3: Failed Runs */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Failed Runs
            </div>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 font-mono">
              {kpis.failedCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Execution or chaos errors
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </Card>

        {/* KPI 4: Total Estimated Time (ms) */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Estimated Time
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 font-mono">
              {kpis.totalEstimatedMs.toLocaleString()} <span className="text-sm font-normal text-slate-500">ms</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Aggregated processing load
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* 2. RUNS BY DAY BAR CHART */}
      {runsByDayData.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Runs by Day (Daily Activity)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {runsByDayData.length} active day{runsByDayData.length > 1 ? 's' : ''} recorded
            </span>
          </div>

          <div className="h-44 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runsByDayData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    `${val} run${val > 1 ? 's' : ''}`,
                    name === 'succeeded' ? 'Succeeded' : name === 'failed' ? 'Failed' : 'Total Runs',
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: 'var(--text)',
                  }}
                  itemStyle={{ color: 'var(--text)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4, color: 'var(--muted)' }} />
                <Bar dataKey="succeeded" name="Succeeded" fill="var(--success)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="var(--danger)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Error alert with Retry */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => loadRuns(false)}
            className="text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Filters Bar & Actions */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search by ID */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Run ID..."
              value={searchId}
              onChange={(e) => {
                setSearchId(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface border border-border text-text rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          {/* Operation Filter (kept in URL Hash) */}
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted whitespace-nowrap">
              Op:
            </span>
            <select
              value={operationFilter}
              onChange={(e) => handleOperationFilterChange(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-surface border border-border text-text rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="All">All Operations</option>
              <option value="validate">Validate</option>
              <option value="process">Process</option>
            </select>
          </div>

          {/* Status Filter (kept in URL Hash) */}
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted whitespace-nowrap">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-surface border border-border text-text rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="All">All Statuses</option>
              <option value="Succeeded">Succeeded</option>
              <option value="Failed">Failed</option>
              <option value="Running">Running</option>
            </select>
          </div>

          {/* Export to CSV Button */}
          <div className="md:col-span-2 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportFilteredCsv}
              disabled={sortedAndFilteredRuns.length === 0}
              className="w-full gap-1.5 text-xs"
              title="Export currently filtered runs to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filter Summary & Compare Trigger Bar */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 dark:text-slate-200">{sortedAndFilteredRuns.length}</strong> of{' '}
              <strong className="text-slate-800 dark:text-slate-200">{runs.length}</strong> recorded runs
            </span>
            {(statusFilter !== 'All' || operationFilter !== 'All' || searchId) && (
              <button
                onClick={handleResetFilters}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Reset filters
              </button>
            )}
          </div>

          {/* Compare Two Runs Banner */}
          {selectedForCompare.length > 0 && (
            <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 py-1 px-2.5 rounded-lg">
              <span className="text-indigo-800 dark:text-indigo-300 font-semibold">
                {selectedForCompare.length} of 2 selected for comparison
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={selectedForCompare.length < 2}
                onClick={() => setIsCompareModalOpen(true)}
                className="gap-1 text-xs py-0.5 px-2"
              >
                <Scale className="w-3.5 h-3.5" />
                Compare Runs
              </Button>
              <button
                type="button"
                onClick={() => setSelectedForCompare([])}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs ml-1"
                title="Clear comparison selection"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Master-Detail Layout (Run list on left, selected run result on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Master Run List */}
        <div className="lg:col-span-7 space-y-4">
          {/* Main Runs Table with Sortable Columns & Pagination */}
          <Card className="p-0 overflow-hidden">
            {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sortedAndFilteredRuns.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<History className="w-6 h-6" />}
              title={
                runs.length === 0
                  ? `No workload runs for ${activeTokenOption.tenant}`
                  : 'No matching runs'
              }
              description={
                runs.length === 0
                  ? `No execution runs recorded for ${activeTokenOption.tenant} yet. Switch identity or execute a batch in the Run Tools tab.`
                  : 'No runs matched your current search and filter criteria.'
              }
              action={
                runs.length > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleResetFilters}
                  >
                    Clear Filters
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/tools')}
                  >
                    Go to Run Tools →
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
              tabIndex={0}
              aria-label="Execution history runs table"
            >
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  <th className="py-3 px-3 w-10 text-center" title="Select to compare two runs">
                    <Scale className="w-3.5 h-3.5 mx-auto text-slate-400" />
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    onClick={() => handleSortToggle('run_id')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Run ID</span>
                      {sortField === 'run_id' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    onClick={() => handleSortToggle('operation')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Operation</span>
                      {sortField === 'operation' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    onClick={() => handleSortToggle('status')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {sortField === 'status' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    onClick={() => handleSortToggle('records')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Records</span>
                      {sortField === 'records' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    onClick={() => handleSortToggle('created_at')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Created Time</span>
                      {sortField === 'created_at' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {paginatedRuns.map((r) => {
                  const shortId = r.run_id ? r.run_id.slice(0, 8) : '—'
                  const isCopied = copiedId === r.run_id
                  const isSelected = selectedRun?.run_id === r.run_id
                  const isCheckedForCompare = selectedForCompare.includes(r.run_id)

                  return (
                    <tr
                      key={r.run_id}
                      onClick={() => handleOpenDrawer(r)}
                      tabIndex={0}
                      role="row"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleOpenDrawer(r)
                        }
                      }}
                      className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-indigo-50/70 dark:focus-visible:bg-indigo-950/60 ${
                        isSelected
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/50'
                          : isCheckedForCompare
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 active:bg-slate-100/60'
                      }`}
                    >
                      {/* Compare Checkbox */}
                      <td className="py-3 px-3 text-center" onClick={(e) => handleToggleCompare(e, r.run_id)}>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none"
                          title={isCheckedForCompare ? 'Unselect for comparison' : 'Select for comparison'}
                        >
                          {isCheckedForCompare ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* Run ID with copy */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{shortId}</span>
                          <button
                            type="button"
                            title="Copy full Run ID"
                            onClick={(e) => handleCopy(e, r.run_id, 'Run ID')}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Operation */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase">
                          {r.operation}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <Badge variant={getStatusBadgeVariant(r.status)}>
                          {r.status}
                        </Badge>
                      </td>

                      {/* Records Count */}
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {getRecordsCount(r)}
                      </td>

                      {/* Created Time */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-700 dark:text-slate-300">
                          {formatUtc(r.created_at)}
                        </div>
                        {r.created_at && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatRelative(r.created_at)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 3. PAGINATION CONTROLS (10 PER PAGE) */}
            <div className="flex items-center justify-between p-3.5 border-t border-slate-200 dark:border-slate-800 text-xs bg-slate-50/50 dark:bg-slate-800/40">
              <div className="text-slate-500 dark:text-slate-400">
                Showing{' '}
                <strong className="text-slate-700 dark:text-slate-300">
                  {Math.min((currentPage - 1) * pageSize + 1, sortedAndFilteredRuns.length)}
                </strong>{' '}
                to{' '}
                <strong className="text-slate-700 dark:text-slate-300">
                  {Math.min(currentPage * pageSize, sortedAndFilteredRuns.length)}
                </strong>{' '}
                of <strong className="text-slate-700 dark:text-slate-300">{sortedAndFilteredRuns.length}</strong> runs
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </Button>

                <div className="font-mono text-xs text-slate-600 dark:text-slate-400 px-2 font-semibold">
                  Page {currentPage} of {totalPages}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="gap-1 text-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
        </div>

        {/* Right Column: Selected Run's Result */}
        <div className="lg:col-span-5 space-y-4 sticky top-6">
          <Card className="p-0 overflow-hidden border border-border bg-surface shadow-xs">
            {/* Detail Header */}
            <div className="p-4 border-b border-border bg-surface-muted/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-text">Run Result Details</h2>
                  {activeDetail && (
                    <Badge variant={getStatusBadgeVariant(activeDetail.status)}>
                      {activeDetail.status}
                    </Badge>
                  )}
                  {activeDetail && (
                    <span className="text-[11px] font-mono font-semibold text-text-secondary bg-surface-muted px-2 py-0.5 rounded uppercase">
                      {activeDetail.operation}
                    </span>
                  )}
                </div>
                {activeDetail && (
                  <div className="flex items-center gap-1.5 mt-1 font-mono text-xs text-muted">
                    <span className="truncate max-w-[200px]" title={activeDetail.run_id}>
                      ID: {activeDetail.run_id}
                    </span>
                    <button
                      onClick={(e) => handleCopy(e, activeDetail.run_id, 'Run ID')}
                      title="Copy full ID"
                      className="text-muted hover:text-text p-0.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {activeDetail && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleRerunNewKey(activeDetail)}
                    isLoading={isReRunning}
                    disabled={activeTokenOption.role === 'Viewer' || activeTokenOption.status === 'Suspended'}
                    title="Re-run with same input using a fresh idempotency key"
                    aria-label="Re-run with new key"
                    className="gap-1 text-xs"
                  >
                    <Play className="w-3 h-3" />
                    Re-run (New Key)
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleReplaySameKey(activeDetail)}
                    isLoading={isReRunning}
                    disabled={activeTokenOption.role === 'Viewer' || activeTokenOption.status === 'Suspended'}
                    title="Replay with same idempotency key (HTTP 200 replay test)"
                    aria-label="Replay with same key"
                    className="gap-1 text-xs"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Replay (Same Key)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenInBuilder(activeDetail)}
                    title="Open this run's records in the Run Tools builder table"
                    aria-label="Load in Builder"
                    className="gap-1 text-xs text-accent hover:text-accent/80"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Builder
                  </Button>
                </div>
              )}
            </div>

            {/* Tabs */}
            {activeDetail && (
              <div className="px-4 pt-2 border-b border-border bg-surface">
                <Tabs
                  tabs={[
                    { id: 'summary', label: 'Summary' },
                    { id: 'raw', label: 'Raw JSON' },
                  ]}
                  activeTab={drawerTab}
                  onChange={(tab) => setDrawerTab(tab)}
                />
              </div>
            )}

            {/* Content Area */}
            <div className="p-4 space-y-5 max-h-[calc(100vh-220px)] overflow-y-auto">
              {isDrawerLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-36 w-full" />
                </div>
              ) : !activeDetail ? (
                <div className="py-12">
                  <EmptyState
                    icon={<Activity className="w-6 h-6 text-slate-400" />}
                    title="No run selected"
                    description="Select a run from the list on the left to inspect its execution results."
                  />
                </div>
              ) : drawerTab === 'raw' ? (
                /* Raw JSON View */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      GET /runs/{activeDetail.run_id}/result
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) =>
                        handleCopy(
                          e,
                          JSON.stringify(activeDetail, null, 2),
                          'Raw JSON'
                        )
                      }
                      className="gap-1 text-xs py-0.5 px-2"
                    >
                      <Copy className="w-3 h-3" />
                      Copy JSON
                    </Button>
                  </div>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed max-h-96">
                    {JSON.stringify(activeDetail, null, 2)}
                  </pre>
                </div>
              ) : (
                /* Summary View */
                <div className="space-y-5">
                  {/* Failed Red Panel with Recorded Error */}
                  {activeDetail.status.toLowerCase() === 'failed' && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2">
                      <div className="font-semibold text-xs flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Recorded Execution Error
                      </div>
                      <div className="font-mono text-xs bg-surface p-2.5 rounded-lg border border-danger/30 text-danger whitespace-pre-wrap break-all leading-relaxed">
                        {activeDetail.error || 'Execution failed with an unrecorded error.'}
                      </div>
                    </div>
                  )}

                  {/* Process Output View */}
                  {activeDetail.operation === 'process' && activeDetail.status.toLowerCase() !== 'failed' && (
                    <div className="space-y-5">
                      {/* Summary Cards */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Process Summary
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          <Stat
                            label="input_rows"
                            value={activeDetail.result?.summary?.input_rows ?? '—'}
                          />
                          <Stat
                            label="total_records"
                            value={activeDetail.result?.summary?.total_records ?? '—'}
                          />
                          <Stat
                            label="total_estimated_ms"
                            value={
                              activeDetail.result?.summary?.total_estimated_ms !== undefined
                                ? `${activeDetail.result.summary.total_estimated_ms} ms`
                                : '—'
                            }
                          />
                        </div>
                      </div>

                      {/* Estimated MS Chart */}
                      {chartData.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            Effort per Record (ms)
                          </h3>
                          <div className="h-40 w-full p-2 bg-slate-50/50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={chartData}
                                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                  dataKey="name"
                                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    color: 'var(--text)',
                                  }}
                                  itemStyle={{ color: 'var(--text)' }}
                                />
                                <Bar
                                  dataKey="estimated_ms"
                                  fill="var(--accent)"
                                  radius={[4, 4, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Rows Table (Order Preserved) */}
                      {activeDetail.result?.rows && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ListOrdered className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            Rows Table (Order Preserved)
                          </h3>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                                <tr>
                                  <th className="py-2 px-3 w-10 text-center">#</th>
                                  <th className="py-2 px-3">Record ID</th>
                                  <th className="py-2 px-3 text-right">Estimated ms</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {activeDetail.result.rows.map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-1.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                    <td className="py-1.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                      {row.record_id}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                      {row.estimated_ms} ms
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Validate Output View */}
                  {activeDetail.operation === 'validate' && activeDetail.status.toLowerCase() !== 'failed' && (
                    <div className="space-y-5">
                      {/* Counts */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Validation Row Counts
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          <Stat
                            label="valid_rows"
                            value={activeDetail.result?.valid_rows ?? 0}
                          />
                          <Stat
                            label="invalid_rows"
                            value={activeDetail.result?.invalid_rows ?? 0}
                          />
                          <Stat
                            label="issues"
                            value={activeDetail.result?.issues?.length ?? 0}
                          />
                        </div>
                      </div>

                      {/* Issues Table */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Validation Issues Table
                        </h3>
                        {activeDetail.result?.issues && activeDetail.result.issues.length > 0 ? (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                                <tr>
                                  <th className="py-2 px-3">Row</th>
                                  <th className="py-2 px-3">Field</th>
                                  <th className="py-2 px-3">Rule ID</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {activeDetail.result.issues.map((issue: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400">
                                      Row {issue.row_index}
                                    </td>
                                    <td className="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                                      {issue.field}
                                    </td>
                                    <td className="py-1.5 px-3">
                                      <Badge variant="danger">{issue.rule_id}</Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                            <span>All batch rows passed validation checks cleanly.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Workload Advisor Card */}
                  {activeDetail.status.toLowerCase() !== 'failed' && activeDetail.result && (
                    <WorkloadAdvisor
                      operation={activeDetail.operation}
                      result={activeDetail.result}
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 7. COMPARE TWO RUNS MODAL (SIDE-BY-SIDE SUMMARY DIFF) */}
      {isCompareModalOpen && runA && runB && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Compare Two Workload Runs"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCompareModalOpen(false)}
          />
          <div className="relative bg-surface rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-border space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Compare Two Workload Runs (Summary Diff)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side-by-side Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-4 w-1/3">Property</th>
                    <th className="py-2.5 px-4 w-1/3 bg-indigo-50/30 dark:bg-indigo-950/20">
                      Run A ({runA.run_id.slice(0, 8)})
                    </th>
                    <th className="py-2.5 px-4 w-1/3 bg-purple-50/30 dark:bg-purple-950/20">
                      Run B ({runB.run_id.slice(0, 8)})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {/* Full Run ID */}
                  <tr>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Run ID</td>
                    <td className="py-2 px-4 text-slate-800 dark:text-slate-200">{runA.run_id}</td>
                    <td className="py-2 px-4 text-slate-800 dark:text-slate-200">{runB.run_id}</td>
                  </tr>

                  {/* Operation */}
                  <tr className={runA.operation !== runB.operation ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Operation</td>
                    <td className="py-2 px-4 uppercase font-bold text-slate-900 dark:text-slate-100">{runA.operation}</td>
                    <td className="py-2 px-4 uppercase font-bold text-slate-900 dark:text-slate-100">{runB.operation}</td>
                  </tr>

                  {/* Status */}
                  <tr className={runA.status !== runB.status ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Status</td>
                    <td className="py-2 px-4">
                      <Badge variant={getStatusBadgeVariant(runA.status)}>{runA.status}</Badge>
                    </td>
                    <td className="py-2 px-4">
                      <Badge variant={getStatusBadgeVariant(runB.status)}>{runB.status}</Badge>
                    </td>
                  </tr>

                  {/* Records Count */}
                  <tr className={getRecordsCount(runA) !== getRecordsCount(runB) ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Records Count</td>
                    <td className="py-2 px-4">{getRecordsCount(runA)}</td>
                    <td className="py-2 px-4">{getRecordsCount(runB)}</td>
                  </tr>

                  {/* Estimated Effort (ms) */}
                  <tr className={getEstimatedMs(runA) !== getEstimatedMs(runB) ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Total Effort (ms)</td>
                    <td className="py-2 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      {getEstimatedMs(runA)} ms
                    </td>
                    <td className="py-2 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      {getEstimatedMs(runB)} ms
                      {getEstimatedMs(runA) !== getEstimatedMs(runB) && (
                        <span className="ml-2 text-[10px] text-slate-400 font-normal">
                          ({getEstimatedMs(runB) > getEstimatedMs(runA) ? '+' : ''}
                          {getEstimatedMs(runB) - getEstimatedMs(runA)} ms)
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Valid / Invalid Rows (for validate) */}
                  <tr>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Valid / Invalid</td>
                    <td className="py-2 px-4">
                      {runA.result?.valid_rows !== undefined
                        ? `${runA.result.valid_rows} valid / ${runA.result.invalid_rows} invalid`
                        : '—'}
                    </td>
                    <td className="py-2 px-4">
                      {runB.result?.valid_rows !== undefined
                        ? `${runB.result.valid_rows} valid / ${runB.result.invalid_rows} invalid`
                        : '—'}
                    </td>
                  </tr>

                  {/* Issues Count */}
                  <tr>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Issues Detected</td>
                    <td className="py-2 px-4">{runA.result?.issues?.length ?? 0}</td>
                    <td className="py-2 px-4">{runB.result?.issues?.length ?? 0}</td>
                  </tr>

                  {/* Created At */}
                  <tr>
                    <td className="py-2 px-4 font-sans font-semibold text-slate-500">Created At</td>
                    <td className="py-2 px-4">{formatUtc(runA.created_at)}</td>
                    <td className="py-2 px-4">{formatUtc(runB.created_at)}</td>
                  </tr>

                  {/* Error Trace */}
                  {(runA.error || runB.error) && (
                    <tr className="bg-rose-50/30 dark:bg-rose-950/20">
                      <td className="py-2 px-4 font-sans font-semibold text-rose-700">Error</td>
                      <td className="py-2 px-4 text-rose-600 text-[11px]">{runA.error || 'None'}</td>
                      <td className="py-2 px-4 text-rose-600 text-[11px]">{runB.error || 'None'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedForCompare([])
                  setIsCompareModalOpen(false)
                }}
              >
                Clear Selection
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsCompareModalOpen(false)}
              >
                Close Comparison
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
