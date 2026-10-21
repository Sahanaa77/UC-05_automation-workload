import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  UC05JobRecord,
  UC05Subscription,
  UC05WorkloadRun,
} from '../types'
import {
  getSubscription,
  getTools,
  createWorkloadRun,
  ToolsApiResponse,
  ApiError,
  DEMO,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import {
  Card,
  Badge,
  Button,
  Skeleton,
  useToast,
  PageHeader,
} from '../components/ui'
import {
  Play,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Zap,
  Copy,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  X,
  PlayCircle,
  Download,
  Printer,
  FileSpreadsheet,
  Terminal,
  Check,
  Upload,
  PieChart as PieIcon,
  TrendingUp,
  Wrench,
  GripVertical,
  Undo2,
  Redo2,
} from 'lucide-react'
import { WorkloadAdvisor } from './WorkloadHistory'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { parseJobRecordsCsv } from '../lib/csv'
import { validateRecordsClientPreview } from '../lib/clientValidation'
import { exportJson, exportCsv } from '../lib/exportUtils'
import { parseJobsFromText, JobParseResult } from '../lib/jobParser'

export const VALID_FIXTURE_RECORDS: UC05JobRecord[] = [
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
  { record_id: 'J02', tool: 'VALIDATE', record_count: 10, environment: 'STAGE' },
]

export const INVALID_FIXTURE_RECORDS: UC05JobRecord[] = [
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' },
  { record_id: 'J02', tool: 'VALIDATE', record_count: 10, environment: 'STAGE' },
  { record_id: 'J01', tool: 'EXPORT', record_count: 20, environment: 'TEST' }, // X1 dup
  { record_id: 'X2', tool: 'DELETE', record_count: 20, environment: 'TEST' },   // X2 DELETE
  { record_id: 'X3', tool: 'EXPORT', record_count: 0, environment: 'TEST' },    // X3 count 0
  { record_id: 'X4', tool: 'EXPORT', record_count: 20, environment: 'PROD' },   // X4 PROD
]

export const ELEVEN_ROWS_FIXTURE: UC05JobRecord[] = Array.from({ length: 11 }, (_, i) => ({
  record_id: `J${String(i + 1).padStart(2, '0')}`,
  tool: 'EXPORT',
  record_count: 10,
  environment: 'TEST',
}))

// Circular quota gauge component
const CircularQuotaGauge: React.FC<{
  used: number
  limit: number
  remaining: number
  animating?: boolean
}> = ({ used, limit, remaining, animating = false }) => {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div
      className={`flex items-center gap-3 transition-all duration-500 rounded-xl ${
        animating ? 'scale-105 ring-2 ring-accent/50 bg-accent/10 px-2 py-1 shadow-sm' : ''
      }`}
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 72 72">
          <circle
            cx="36"
            cy="36"
            r={radius}
            className="text-border"
            strokeWidth="7"
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="36"
            cy="36"
            r={radius}
            className={`transition-[stroke-dashoffset] duration-700 ease-out ${
              remaining === 0 ? 'text-danger' : 'text-accent'
            } ${animating ? 'animate-pulse' : ''}`}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
          />
        </svg>
        <span
          className={`absolute text-xs font-extrabold text-text transition-transform duration-300 ${
            animating ? 'scale-125 text-accent font-black' : ''
          }`}
        >
          {remaining}
        </span>
      </div>
      <div>
        <div className="text-sm font-bold text-text">
          {remaining} remaining
        </div>
        <div className="text-xs text-muted">
          {used} of {limit} used today
        </div>
      </div>
    </div>
  )
}

// Request timeline strip component
interface RequestTimelineStripProps {
  status: number | null
  runStatus?: 'Succeeded' | 'Failed' | string
}

const RequestTimelineStrip: React.FC<RequestTimelineStripProps> = ({
  status,
  runStatus,
}) => {
  if (status === null) return null

  // Stages:
  // 1: Authenticated
  // 2: Authorized
  // 3: Validated
  // 4: Quota reserved
  // 5: Processed
  let stoppedAt: number | null = null
  let stoppedReason = ''

  if (status === 401) {
    stoppedAt = 1
    stoppedReason = '401 Unauthorized'
  } else if (status === 403) {
    stoppedAt = 2
    stoppedReason = '403 Forbidden'
  } else if (status === 400) {
    stoppedAt = 3
    stoppedReason = '400 Validation Error'
  } else if (status === 429) {
    stoppedAt = 4
    stoppedReason = '429 Quota Exhausted'
  } else if (status === 409) {
    stoppedAt = 4
    stoppedReason = '409 Conflict'
  } else if (status >= 200 && status < 300) {
    if (runStatus === 'Failed') {
      stoppedAt = 5
      stoppedReason = '500 Execution Failed'
    } else {
      stoppedAt = null
      stoppedReason = status === 200 ? '200 OK (Replay)' : '201 Created'
    }
  } else {
    stoppedAt = 5
    stoppedReason = `${status} Server Error`
  }

  const stages = [
    { id: 1, name: 'Authenticated', desc: 'Bearer token verification' },
    { id: 2, name: 'Authorized', desc: 'Role & plan entitlement' },
    { id: 3, name: 'Validated', desc: 'Batch bounds & R1–R4' },
    { id: 4, name: 'Quota reserved', desc: 'Daily rate allocation' },
    { id: 5, name: 'Processed', desc: 'Execution & output' },
  ]

  return (
    <Card className="p-3 bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-800">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          Request Timeline Strip
        </span>
        <Badge
          variant={
            stoppedAt === null
              ? 'success'
              : status === 429 || status === 409
              ? 'warn'
              : 'danger'
          }
          className="font-mono text-[10px]"
        >
          {stoppedReason}
        </Badge>
      </div>

      <div className="grid grid-cols-5 gap-1 pt-1">
        {stages.map((stage, idx) => {
          let stageState: 'passed' | 'failed' | 'not_reached' = 'passed'
          if (stoppedAt !== null) {
            if (stage.id < stoppedAt) stageState = 'passed'
            else if (stage.id === stoppedAt) stageState = 'failed'
            else stageState = 'not_reached'
          }

          return (
            <div key={stage.id} className="relative flex flex-col items-center text-center">
              {idx > 0 && (
                <div
                  className={`absolute top-2.5 -left-1/2 w-full h-0.5 -z-0 ${
                    stageState === 'not_reached'
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : stageState === 'failed'
                      ? 'bg-rose-300 dark:bg-rose-800'
                      : 'bg-emerald-400 dark:bg-emerald-600'
                  }`}
                />
              )}

              <div
                className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                  stageState === 'passed'
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : stageState === 'failed'
                    ? 'bg-rose-500 border-rose-500 text-white ring-2 ring-rose-200 dark:ring-rose-900'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                }`}
              >
                {stageState === 'passed' && <Check className="w-3 h-3 stroke-[3]" />}
                {stageState === 'failed' && <X className="w-3 h-3 stroke-[3]" />}
                {stageState === 'not_reached' && <span>{stage.id}</span>}
              </div>

              <div
                className={`text-[10px] sm:text-[11px] font-semibold mt-1 leading-tight ${
                  stageState === 'passed'
                    ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                    : stageState === 'failed'
                    ? 'text-rose-700 dark:text-rose-400 font-bold'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {stage.name}
              </div>
              <div className="text-[9px] text-slate-400 dark:text-slate-500 hidden sm:block truncate max-w-full">
                {stageState === 'failed' ? (
                  <span className="text-rose-600 font-bold">Stopped</span>
                ) : stageState === 'passed' ? (
                  'Passed'
                ) : (
                  'Pending'
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export const RunTools: React.FC = () => {
  const { token, activeTokenOption } = useAuth()
  const { toast } = useToast()
  const [subscription, setSubscription] = useState<UC05Subscription | null>(null)
  const [toolsData, setToolsData] = useState<ToolsApiResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState<boolean>(false)

  // Builder state
  const [operation, setOperation] = useState<'validate' | 'process'>('validate')
  const [records, setRecords] = useState<UC05JobRecord[]>(VALID_FIXTURE_RECORDS)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())
  const [reuseLastKey, setReuseLastKey] = useState<boolean>(false)
  const [lastSubmittedKey, setLastSubmittedKey] = useState<string>('')
  const [forceFailure, setForceFailure] = useState<boolean>(false)

  // Interaction, undo/redo, and drag states
  const [quotaAnimating, setQuotaAnimating] = useState<boolean>(false)
  const [history, setHistory] = useState<UC05JobRecord[][]>([])
  const [future, setFuture] = useState<UC05JobRecord[][]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Preload workload if redirected from History
  useEffect(() => {
    try {
      const rawPreload = sessionStorage.getItem('workload_builder_preload')
      if (rawPreload) {
        sessionStorage.removeItem('workload_builder_preload')
        const parsed = JSON.parse(rawPreload)
        if (parsed.records && Array.isArray(parsed.records) && parsed.records.length > 0) {
          setRecords(parsed.records)
        }
        if (parsed.operation) {
          setOperation(parsed.operation)
        }
        if (parsed.idempotencyKey) {
          setIdempotencyKey(parsed.idempotencyKey)
          setReuseLastKey(true)
          setLastSubmittedKey(parsed.idempotencyKey)
        }
        toast('Loaded From History', `Preloaded ${parsed.records?.length || 0} rows into builder`, 'info')
      }
    } catch {}
  }, [toast])

  // Execution & results state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<UC05WorkloadRun | null>(null)
  const [rawErrorData, setRawErrorData] = useState<any>(null)
  const [validationIssues, setValidationIssues] = useState<any[]>([])
  const [showRawJson, setShowRawJson] = useState<boolean>(false)

  // Tools Accordion ("Describe your jobs" & CSV Import) and Advisor Accordion
  const [isToolsAccordionOpen, setIsToolsAccordionOpen] = useState<boolean>(false)
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false)
  const [csvText, setCsvText] = useState<string>('')
  const [csvError, setCsvError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Smart builder state ("Describe your jobs")
  const [jobPromptText, setJobPromptText] = useState<string>('')
  const [parsedJobResult, setParsedJobResult] = useState<JobParseResult | null>(null)

  // Demo scenarios drawer state
  const [isDemoDrawerOpen, setIsDemoDrawerOpen] = useState<boolean>(false)
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null)
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false)
  const [scenarioResults, setScenarioResults] = useState<
    Record<string, { status: number; pass: boolean; details: string }>
  >({})

  // Compute live client-side validation preview (R1–R4)
  const clientValidation = useMemo(() => {
    return validateRecordsClientPreview(records)
  }, [records])

  const DEMO_SCENARIOS = [
    {
      id: 'valid_validate',
      title: 'Valid Validate',
      expected: 'HTTP 201 with 2 valid',
      desc: 'Runs 2 compliant records (J01, J02). Expects 201 with 2 valid rows.',
    },
    {
      id: 'invalid_validate',
      title: 'Invalid Validate',
      expected: 'HTTP 201 with 2 valid, 4 invalid',
      desc: 'Runs 6 fixture rows with R1-R4 errors. Expects 201 with 2 valid and 4 invalid rows.',
    },
    {
      id: 'invalid_process',
      title: 'Invalid Process',
      expected: 'HTTP 400 Bad Request',
      desc: 'Submits invalid rows for process execution. Expects immediate rejection with 400.',
    },
    {
      id: 'eleven_rows',
      title: '11 Rows (Bounds Violation)',
      expected: 'HTTP 400 Bad Request',
      desc: 'Submits 11 rows to test maximum 10-row batch boundary limit. Expects 400.',
    },
    {
      id: 'replay_same_key',
      title: 'Replay Same Key',
      expected: 'HTTP 200 OK (Same Run ID)',
      desc: 'Re-sends same key and payload. Expects 200 replay returning same run_id.',
    },
    {
      id: 'same_key_changed_input',
      title: 'Same Key Changed Input',
      expected: 'HTTP 409 Conflict',
      desc: 'Re-sends same key with altered payload. Expects 409 conflict rejection.',
    },
    {
      id: 'unauthenticated_runs',
      title: 'Unauthenticated GET /runs',
      expected: 'HTTP 401 Unauthorized',
      desc: 'Requests /runs without Authorization header. Expects 401 rejection.',
    },
    {
      id: 'viewer_submit',
      title: 'Viewer Submit',
      expected: 'HTTP 403 Forbidden',
      desc: 'Submits using Viewer identity. Expects 403 Forbidden (Operator role required).',
    },
    {
      id: 'basic_process',
      title: 'Basic Process',
      expected: 'HTTP 403 Forbidden',
      desc: 'Submits process using Basic plan identity. Expects 403 (Pro plan required).',
    },
  ]

  const runScenarioById = async (id: string) => {
    setRunningScenarioId(id)
    try {
      if (id === 'valid_validate') {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'validate', records: VALID_FIXTURE_RECORDS }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = (res.status === 201 || res.status === 200) && data?.result?.valid_rows === 2 && data?.result?.invalid_rows === 0
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: `Valid: ${data?.result?.valid_rows ?? 0}, Invalid: ${data?.result?.invalid_rows ?? 0}`,
          },
        }))
      } else if (id === 'invalid_validate') {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'validate', records: INVALID_FIXTURE_RECORDS }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = (res.status === 201 || res.status === 200) && data?.result?.valid_rows === 2 && data?.result?.invalid_rows === 4
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: `Valid: ${data?.result?.valid_rows ?? 0}, Invalid: ${data?.result?.invalid_rows ?? 0} (${data?.result?.issues?.length || 0} issues)`,
          },
        }))
      } else if (id === 'invalid_process') {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'process', records: INVALID_FIXTURE_RECORDS }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = res.status === 400
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: data?.detail?.message || data?.detail || '400 Bad Request: Invalid rows rejected',
          },
        }))
      } else if (id === 'eleven_rows') {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'validate', records: ELEVEN_ROWS_FIXTURE }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = res.status === 400
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: data?.detail?.message || data?.detail || '400 Bad Request: Batch exceeds 10 rows limit',
          },
        }))
      } else if (id === 'replay_same_key') {
        const key = crypto.randomUUID()
        const res1 = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ operation: 'validate', records: VALID_FIXTURE_RECORDS }),
        })
        const data1 = await res1.json().catch(() => ({}))
        const res2 = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ operation: 'validate', records: VALID_FIXTURE_RECORDS }),
        })
        const data2 = await res2.json().catch(() => ({}))
        const pass = res2.status === 200 && data2?.run_id === data1?.run_id
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res2.status,
            pass,
            details: `HTTP 200: Replayed run ${data2?.run_id?.slice(0, 8)}... (0 quota used)`,
          },
        }))
      } else if (id === 'same_key_changed_input') {
        const key = crypto.randomUUID()
        await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ operation: 'validate', records: VALID_FIXTURE_RECORDS }),
        })
        const res2 = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ operation: 'validate', records: [VALID_FIXTURE_RECORDS[0]] }),
        })
        const data2 = await res2.json().catch(() => ({}))
        const pass = res2.status === 409
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res2.status,
            pass,
            details: data2?.detail || '409 Conflict: Idempotency-Key reuse with different payload',
          },
        }))
      } else if (id === 'unauthenticated_runs') {
        const res = await fetch('/api/runs')
        const data = await res.json().catch(() => ({}))
        const pass = res.status === 401
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: data?.detail || '401 Unauthorized: Bearer token required',
          },
        }))
      } else if (id === 'viewer_submit') {
        const viewerToken = 'dev-token-a-viewer'
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${viewerToken}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'validate', records: VALID_FIXTURE_RECORDS }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = res.status === 403
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: data?.detail || '403 Forbidden: Viewer role cannot create runs',
          },
        }))
      } else if (id === 'basic_process') {
        const basicToken = 'dev-token-b-operator'
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${basicToken}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ operation: 'process', records: VALID_FIXTURE_RECORDS }),
        })
        const data = await res.json().catch(() => ({}))
        const pass = res.status === 403
        setScenarioResults((prev) => ({
          ...prev,
          [id]: {
            status: res.status,
            pass,
            details: data?.detail || "403 Forbidden: Operation 'process' requires Pro plan",
          },
        }))
      }
    } catch (err: any) {
      setScenarioResults((prev) => ({
        ...prev,
        [id]: {
          status: 500,
          pass: false,
          details: err.message || 'Execution error',
        },
      }))
    } finally {
      setRunningScenarioId(null)
    }
  }

  const runAllScenarios = async () => {
    setIsRunningAll(true)
    for (const sc of DEMO_SCENARIOS) {
      await runScenarioById(sc.id)
    }
    setIsRunningAll(false)
  }

  const loadData = async (activeAuthToken?: string) => {
    const currentAuthToken = activeAuthToken || token
    setStatsLoading(true)
    setSubscription(null)
    setToolsData(null)
    try {
      const [sub, tools] = await Promise.all([
        getSubscription(currentAuthToken),
        getTools(currentAuthToken),
      ])
      setSubscription(sub)
      setToolsData(tools)
    } catch (err: any) {
      console.error('Error fetching subscription/tools for', currentAuthToken, err)
    } finally {
      setStatsLoading(false)
    }
  }

  // 1) IDENTITY REFRESH BUG FIX:
  // On identity change: clear the last result, show skeletons, refetch /subscription, /tools
  useEffect(() => {
    // 1. Clear last result and all error states immediately
    setLastRun(null)
    setResponseStatus(null)
    setRawErrorData(null)
    setValidationIssues([])
    setLastSubmittedKey('')
    setShowRawJson(false)

    // 2. Refetch subscription and tools for current identity
    loadData(token)
  }, [token])

  useEffect(() => {
    document.title = 'Run Tools | WorkloadLens'
  }, [])

  useEffect(() => {
    const handleOpenScenarios = () => setIsDemoDrawerOpen(true)
    const handleLoadFixture = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (customEvent.detail === 'valid') {
        setRecords(VALID_FIXTURE_RECORDS)
        toast('Valid Fixture Loaded', 'Loaded 2 compliant job records into builder', 'success')
      } else if (customEvent.detail === 'invalid') {
        setRecords(INVALID_FIXTURE_RECORDS)
        toast('Invalid Fixture Loaded', 'Loaded records with duplicate record_id', 'warn')
      } else if (customEvent.detail === 'clear') {
        setRecords([])
        toast('Records Cleared', 'Job builder cleared', 'info')
      }
    }

    window.addEventListener('workloadlens:open-scenarios', handleOpenScenarios)
    window.addEventListener('workloadlens:load-fixture', handleLoadFixture)
    return () => {
      window.removeEventListener('workloadlens:open-scenarios', handleOpenScenarios)
      window.removeEventListener('workloadlens:load-fixture', handleLoadFixture)
    }
  }, [toast])

  const planName = subscription?.plan || activeTokenOption.plan
  const subStatus = subscription?.status || activeTokenOption.status
  const remainingQuota = subscription?.remaining_quota ?? subscription?.remaining ?? 0
  const dailyQuota = subscription?.daily_quota ?? subscription?.daily_limit ?? 0
  const usedToday = subscription?.used_today ?? 0

  // 2) PROCESS & SUBMIT PERMISSIONS LOGIC
  // Process is enabled only for an active Pro Operator.
  const isViewer = activeTokenOption.role === 'Viewer'
  const isSuspended = subStatus === 'Suspended' || activeTokenOption.status === 'Suspended'
  const isBasic = planName === 'Basic' || activeTokenOption.plan === 'Basic'
  const isProOperator = !isViewer && !isSuspended && !isBasic

  let processDisabledReason: string | null = null
  if (isViewer) {
    processDisabledReason = 'Viewers are read-only'
  } else if (isBasic) {
    processDisabledReason = 'Basic plan allows validate only - upgrade to Pro'
  } else if (isSuspended) {
    processDisabledReason = 'Subscription suspended'
  }

  let submitDisabledReason: string | null = null
  if (isViewer) {
    submitDisabledReason = 'Viewers are read-only'
  } else if (isSuspended) {
    submitDisabledReason = 'Subscription suspended'
  }

  // If switched to an identity without process permission, reset operation to validate
  useEffect(() => {
    if (!isProOperator && operation === 'process') {
      setOperation('validate')
    }
  }, [isProOperator, operation])

  const updateRecords = useCallback(
    (
      newRecords: UC05JobRecord[] | ((prev: UC05JobRecord[]) => UC05JobRecord[]),
      pushToHistory = true
    ) => {
      setRecords((prev) => {
        const resolved = typeof newRecords === 'function' ? newRecords(prev) : newRecords
        if (pushToHistory) {
          setHistory((h) => [...h.slice(-29), prev])
          setFuture([])
        }
        return resolved
      })
    },
    []
  )

  const handleUndo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory
      const previous = prevHistory[prevHistory.length - 1]
      const nextHistory = prevHistory.slice(0, -1)
      setRecords((current) => {
        setFuture((f) => [current, ...f.slice(0, 29)])
        return previous
      })
      toast('Undo', 'Reverted previous table state', 'info')
      return nextHistory
    })
  }, [toast])

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture
      const next = prevFuture[0]
      const nextFuture = prevFuture.slice(1)
      setRecords((current) => {
        setHistory((h) => [...h.slice(-29), current])
        return next
      })
      toast('Redo', 'Restored table state', 'info')
      return nextFuture
    })
  }, [toast])

  const handleUpdateRecord = (index: number, field: keyof UC05JobRecord, value: any) => {
    const updated = [...records]
    updated[index] = { ...updated[index], [field]: value }
    updateRecords(updated)
  }

  const handleAddRow = () => {
    if (records.length >= 10) return
    const nextNum = records.length + 1
    const nextId = `J${String(nextNum).padStart(2, '0')}`
    updateRecords([
      ...records,
      { record_id: nextId, tool: 'EXPORT', record_count: 10, environment: 'TEST' },
    ])
  }

  const handleDuplicateRow = (index: number) => {
    if (records.length >= 10) {
      toast('Maximum 10 rows', 'A workload batch cannot exceed 10 records.', 'warn')
      return
    }
    const source = records[index]
    const nextNum = records.length + 1
    const nextId = `J${String(nextNum).padStart(2, '0')}`
    const duplicated: UC05JobRecord = {
      ...source,
      record_id: nextId,
    }
    updateRecords((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, duplicated)
      return next
    })
    toast('Row Duplicated', `Duplicated row as ${nextId}`, 'info')
  }

  const handleRemoveRow = (index: number) => {
    if (records.length <= 1) return
    updateRecords(records.filter((_, i) => i !== index))
  }

  const handleReorderRows = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    updateRecords((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    toast('Rows Reordered', `Moved row ${fromIndex + 1} to position ${toIndex + 1}`, 'info')
  }

  const handleLoadValid = () => {
    updateRecords(VALID_FIXTURE_RECORDS)
    toast('Loaded valid fixture (2 rows)', undefined, 'info')
  }

  const handleLoadInvalid = () => {
    updateRecords(INVALID_FIXTURE_RECORDS)
    toast('Loaded invalid fixture (6 rows)', undefined, 'warn')
  }

  const handleLoadEleven = () => {
    updateRecords(ELEVEN_ROWS_FIXTURE)
    toast('Loaded 11 rows (bounds test)', undefined, 'warn')
  }

  const handleRegenerateKey = () => {
    const newKey = crypto.randomUUID()
    setIdempotencyKey(newKey)
  }

  // Smart builder handlers
  const handleGenerateRows = () => {
    if (!jobPromptText.trim()) return
    const res = parseJobsFromText(jobPromptText, records.length)
    setParsedJobResult(res)
    if (res.records.length > 0) {
      toast('Rows Generated', `Generated ${res.records.length} job rows from description`, 'success')
    } else {
      toast('Parsing Failed', 'Could not parse any valid job rows from text', 'warn')
    }
  }

  const handleAddToTable = () => {
    if (!parsedJobResult || parsedJobResult.records.length === 0) return
    const remainingSlots = 10 - records.length
    if (remainingSlots <= 0) {
      toast('10-Row Limit Reached', 'Workload batches are strictly limited to 10 rows maximum.', 'warn')
      return
    }
    const toAdd = parsedJobResult.records.slice(0, remainingSlots)
    updateRecords((prev) => [...prev, ...toAdd])
    if (parsedJobResult.records.length > remainingSlots) {
      toast(
        'Rows Added (10-Row Limit)',
        `Added ${toAdd.length} rows (capped at batch limit of 10 rows).`,
        'warn'
      )
    } else {
      toast('Added to Table', `Added ${toAdd.length} rows to builder table`, 'success')
    }
    setParsedJobResult(null)
    setJobPromptText('')
  }

  // Submit workload execution
  const executeSubmit = async () => {
    if (isSubmitting || records.length === 0) return

    setIsSubmitting(true)
    setResponseStatus(null)
    setLastRun(null)
    setRawErrorData(null)

    const keyToUse = reuseLastKey && lastSubmittedKey ? lastSubmittedKey : idempotencyKey
    setLastSubmittedKey(keyToUse)

    try {
      const result = await createWorkloadRun(
        operation,
        records,
        keyToUse,
        token,
        forceFailure
      )
      const status = result.http_status ?? 201
      setResponseStatus(status)
      setLastRun(result)

      // Quota gauge animation on accepted run
      if (status === 200 || status === 201) {
        setQuotaAnimating(true)
        setTimeout(() => setQuotaAnimating(false), 1800)
      }

      // Persist run inputs to localStorage for Re-run / Replay in History
      if (result.run_id) {
        try {
          localStorage.setItem(
            `run_input_${result.run_id}`,
            JSON.stringify({
              records,
              operation,
              idempotencyKey: keyToUse,
            })
          )
        } catch {}
      }

      if (operation === 'validate' && result.result?.issues) {
        setValidationIssues(result.result.issues)
      } else {
        setValidationIssues([])
      }

      toast(
        status === 200 ? 'Replay of earlier run (200 OK)' : `Run created (201 Created)`,
        `Run ID: ${result.run_id}`,
        'success'
      )

      if (!reuseLastKey) {
        setIdempotencyKey(crypto.randomUUID())
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setResponseStatus(err.status)
        setRawErrorData(err.data)
        if (err.data?.detail?.issues) {
          setValidationIssues(err.data.detail.issues)
        }
      } else {
        setResponseStatus(500)
        setRawErrorData({ detail: err.message || 'Execution failed' })
      }
      toast('Request rejected', err.message, 'error')
    } finally {
      setIsSubmitting(false)
      await loadData()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewer || isSuspended) {
      toast('Action not permitted', submitDisabledReason || 'Execution not allowed', 'warn')
      return
    }
    executeSubmit()
  }

  // Keyboard shortcuts: Ctrl+Enter to submit, Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey
      if (isCtrl && e.key === 'Enter') {
        e.preventDefault()
        if (!isSubmitting && records.length > 0 && !isViewer && !isSuspended) {
          executeSubmit()
        }
        return
      }

      const targetTag = (e.target as HTMLElement)?.tagName
      const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA'

      if (isCtrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (!isTyping) {
          e.preventDefault()
          handleUndo()
        }
      } else if (
        (isCtrl && (e.key === 'y' || e.key === 'Y')) ||
        (isCtrl && (e.key === 'z' || e.key === 'Z') && e.shiftKey)
      ) {
        if (!isTyping) {
          e.preventDefault()
          handleRedo()
        }
      } else if (e.key === 'Escape') {
        if (isDemoDrawerOpen) {
          setIsDemoDrawerOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, records, operation, idempotencyKey, reuseLastKey, lastSubmittedKey, forceFailure, token, isViewer, isSuspended, submitDisabledReason, handleUndo, handleRedo, isDemoDrawerOpen])

  // Copy current request as cURL command (with placeholders, NEVER real tokens)
  const handleCopyAsCurl = () => {
    const url = `${window.location.origin}/api/runs`
    const bodyObj = {
      operation,
      records,
    }
    const bodyStr = JSON.stringify(bodyObj, null, 2)
    let curl = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer <AUTH_TOKEN>" \\\n  -H "Idempotency-Key: <IDEMPOTENCY_KEY>"`
    if (forceFailure) {
      curl += ` \\\n  -H "X-Force-Failure: true"`
    }
    curl += ` \\\n  -d '${bodyStr}'`

    navigator.clipboard.writeText(curl)
    toast('Copied cURL Command', 'Authorization and Idempotency-Key are set to placeholders', 'info')
  }

  // Handle CSV Import
  const handleApplyCsv = () => {
    setCsvError(null)
    const result = parseJobRecordsCsv(csvText)
    if (result.error) {
      setCsvError(result.error)
      return
    }

    // Apply parsed records, cap at 10, clear all previous errors
    updateRecords(result.records)
    setRawErrorData(null)
    setValidationIssues([])
    setLastRun(null)
    setResponseStatus(null)
    setCsvText('')

    if (result.warning) {
      toast('CSV Imported (10-Row Limit)', result.warning, 'warn')
    } else {
      toast('CSV Imported', `Successfully loaded ${result.records.length} records into builder`, 'success')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content === 'string') {
        setCsvText(content)
      }
    }
    reader.readAsText(file)
  }

  // Exports
  const handleDownloadJson = () => {
    const data = lastRun || rawErrorData || { operation, records }
    const runId = lastRun?.run_id ? lastRun.run_id.slice(0, 8) : 'output'
    exportJson(`workload_run_${runId}`, data)
    toast('JSON Exported', 'File downloaded successfully', 'info')
  }

  const handleDownloadCsv = () => {
    const runId = lastRun?.run_id ? lastRun.run_id.slice(0, 8) : 'output'
    if (lastRun?.operation === 'process' && lastRun?.result?.rows) {
      const headers = ['Record ID', 'Estimated Effort (ms)']
      const rows = lastRun.result.rows.map((r: any) => [r.record_id, r.estimated_ms])
      exportCsv(`workload_process_${runId}`, headers, rows)
    } else if (lastRun?.operation === 'validate' && lastRun?.result?.issues?.length) {
      const headers = ['Row Index', 'Field', 'Rule ID', 'Description']
      const rows = lastRun.result.issues.map((i: any) => [
        i.row_index,
        i.field,
        i.rule_id,
        i.description || '',
      ])
      exportCsv(`workload_issues_${runId}`, headers, rows)
    } else {
      const headers = ['Record ID', 'Tool', 'Record Count', 'Environment']
      const rows = records.map((r) => [r.record_id, r.tool, r.record_count, r.environment])
      exportCsv(`workload_records_${runId}`, headers, rows)
    }
    toast('CSV Exported', 'File downloaded successfully', 'info')
  }

  const handlePrintReport = () => {
    window.print()
  }

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    toast('Copied raw JSON to clipboard', undefined, 'info')
  }

  // Get inline errors for a specific row index (1-based)
  const getRowIssues = (rowIdx: number) => {
    return validationIssues.filter((iss) => iss.row_index === rowIdx)
  }

  // Process result aggregations
  const toolLookup = useMemo(() => {
    const map = new Map<string, string>()
    records.forEach((r) => map.set(r.record_id, r.tool))
    return map
  }, [records])

  // Cumulative time chart data
  const cumulativeTimeData = useMemo(() => {
    if (!lastRun?.result?.rows) return []
    let sum = 0
    return lastRun.result.rows.map((row: any, idx: number) => {
      const ms = Number(row.estimated_ms) || 0
      sum += ms
      return {
        name: row.record_id || `R${idx + 1}`,
        effort: ms,
        cumulative_ms: sum,
      }
    })
  }, [lastRun])

  // Tool breakdown donut data (EXPORT vs VALIDATE)
  const toolBreakdownData = useMemo(() => {
    if (!lastRun?.result?.rows) return []
    let exportEffort = 0
    let validateEffort = 0
    let exportCount = 0
    let validateCount = 0

    lastRun.result.rows.forEach((r: any) => {
      const tool = toolLookup.get(r.record_id) || 'EXPORT'
      const ms = Number(r.estimated_ms) || 0
      if (tool === 'VALIDATE') {
        validateEffort += ms
        validateCount++
      } else {
        exportEffort += ms
        exportCount++
      }
    })

    return [
      { name: 'EXPORT', value: exportEffort, count: exportCount, color: 'var(--accent)' },
      { name: 'VALIDATE', value: validateEffort, count: validateCount, color: 'var(--success)' },
    ].filter((d) => d.count > 0 || d.value > 0)
  }, [lastRun, toolLookup])


  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <PageHeader
        title="Run Tools"
        description="Configure job records to preview workload validation or execute runtime estimations."
        icon={<Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        breadcrumbs={[
          { label: 'WorkloadLens', href: '#/tools' },
          { label: 'Run Tools' },
        ]}
        actions={
          DEMO ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsDemoDrawerOpen(true)}
              className="gap-1.5 shadow-2xs border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60 text-[13px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Demo Scenarios
            </Button>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------------------- */}
      {/* TOP ROW: 3 STAT CARDS                                               */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Plan */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-muted uppercase tracking-wider">
              Tenant Plan
            </div>
            {statsLoading ? (
              <Skeleton className="w-28 h-7 mt-1.5" />
            ) : (
              <div className="text-xl font-extrabold text-text mt-1 flex items-center gap-2">
                {planName}
                <Badge variant={subStatus === 'Active' ? 'success' : 'danger'} className="text-[13px]">
                  {subStatus}
                </Badge>
              </div>
            )}
            <div className="text-[13px] text-muted mt-1">
              Role: <strong className="text-text">{activeTokenOption.role}</strong>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 2: Remaining runs today (Circular gauge) */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-muted uppercase tracking-wider mb-1">
              Daily Quota Gauge
            </div>
            {statsLoading ? (
              <Skeleton className="w-32 h-12" />
            ) : (
              <CircularQuotaGauge
                used={usedToday}
                limit={dailyQuota}
                remaining={remainingQuota}
                animating={quotaAnimating}
              />
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-muted text-muted flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 3: Allowed operations */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-muted uppercase tracking-wider">
              Allowed Operations
            </div>
            {statsLoading ? (
              <Skeleton className="w-32 h-6 mt-1.5" />
            ) : (
              <div className="text-base font-bold text-text mt-1 flex items-center gap-1.5 flex-wrap">
                {(toolsData?.allowed_operations || (planName === 'Pro' ? ['validate', 'process'] : ['validate'])).map(
                  (op) => (
                    <Badge
                      key={op}
                      variant={op === 'process' ? 'info' : 'default'}
                      className="font-mono uppercase text-[13px]"
                    >
                      {op}
                    </Badge>
                  )
                )}
              </div>
            )}
            <div className="text-[13px] text-muted mt-1">
              Rate: {toolsData?.rate_ms_per_record ?? 10} ms / record estimation
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* TWO-COLUMN LAYOUT: Left (Request Builder) | Right (Result Panel)     */}
      {/* 2 columns above 1024px (lg:), 1 column below                        */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: Request Builder */}
        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Header & Operation Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="text-sm font-bold text-text">Request Builder</h2>
                  <p className="text-[13px] text-muted">Configure workload batch</p>
                </div>

                {/* Operation Toggle & Process Permission Handling */}
                <div>
                  <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setOperation('validate')}
                      className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-all cursor-pointer ${
                        operation === 'validate'
                          ? 'bg-surface text-accent shadow-2xs'
                          : 'text-text-secondary hover:text-text'
                      }`}
                    >
                      Validate
                    </button>
                    <div className="relative group">
                      <button
                        type="button"
                        disabled={!isProOperator}
                        onClick={() => isProOperator && setOperation('process')}
                        title={processDisabledReason || 'Execute process workload on Pro plan'}
                        className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
                          !isProOperator
                            ? 'opacity-40 cursor-not-allowed text-muted'
                            : operation === 'process'
                            ? 'bg-surface text-accent shadow-2xs cursor-pointer'
                            : 'text-text-secondary hover:text-text cursor-pointer'
                        }`}
                      >
                        Process
                      </button>
                    </div>
                  </div>
                  {/* Visible reason line under the toggle */}
                  {processDisabledReason && (
                    <div className="text-[13px] font-medium text-amber-600 dark:text-amber-400 mt-1.5 flex items-center justify-end gap-1">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{processDisabledReason}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Toolbar: Fixtures, CSV Import, Copy cURL */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button type="button" variant="secondary" size="sm" onClick={handleLoadValid}>
                    Valid
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={handleLoadInvalid}>
                    Invalid
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={handleLoadEleven}>
                    11 rows
                  </Button>
                </div>

                {DEMO && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyAsCurl}
                    className="gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    title="Copy as cURL command (uses placeholders for Auth and Idempotency key)"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Copy as curl
                  </Button>
                )}
              </div>

              {/* LIVE CLIENT-SIDE VALIDATION PREVIEW BAR */}
              <div
                className={`p-2.5 rounded-lg border text-[13px] flex items-center justify-between flex-wrap gap-2 transition-all ${
                  clientValidation.isValid
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-300'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800/60 dark:text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {clientValidation.isValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                  <span>
                    {clientValidation.isValid ? (
                      <span>All {records.length} records satisfy format checks</span>
                    ) : (
                      <span>
                        <strong>{clientValidation.invalidCount}</strong> of {records.length} rows have potential issues ({clientValidation.issues.length} detected)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold tracking-tight bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                    preview - server is authoritative
                  </span>
                </div>
              </div>

              {/* Tools Accordion: Smart Builder ("Describe your jobs") & CSV Import */}
              <div className="border border-border rounded-xl overflow-hidden bg-surface shadow-2xs">
                <button
                  type="button"
                  onClick={() => setIsToolsAccordionOpen((prev) => !prev)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left text-[13px] font-semibold text-text hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-accent" />
                    <span>Tools (Smart Builder &amp; CSV Import)</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 ${
                      isToolsAccordionOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isToolsAccordionOpen && (
                  <div className="p-4 border-t border-border space-y-4 bg-surface-muted/20">
                    {/* Part 1: Describe your jobs */}
                    <div className="space-y-3 p-3.5 rounded-lg border border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="text-[13px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                            Describe your jobs
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Smart builder - rule-based, runs in your browser
                        </span>
                      </div>

                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        Type job requirements in plain English (e.g. <em>&quot;export 500 records in stage as J10; validate 40 records in test as J11&quot;</em>).
                      </p>

                      <textarea
                        value={jobPromptText}
                        onChange={(e) => setJobPromptText(e.target.value)}
                        placeholder="export 500 records in stage as J10; validate 40 records in test as J11"
                        rows={2}
                        className="w-full text-[13px] font-mono p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateRows}
                          disabled={!jobPromptText.trim()}
                          className="gap-1.5 text-[13px] text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/50"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Generate rows
                        </Button>

                        {parsedJobResult && parsedJobResult.records.length > 0 && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleAddToTable}
                            disabled={records.length >= 10}
                            className="gap-1.5 text-[13px]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add to table ({parsedJobResult.records.length})
                          </Button>
                        )}
                      </div>

                      {/* Preview of Generated Rows & Unparseable Warnings */}
                      {parsedJobResult && (
                        <div className="space-y-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                          {parsedJobResult.records.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                Preview Generated Rows ({parsedJobResult.records.length}):
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {parsedJobResult.records.map((r, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs"
                                  >
                                    <strong className="text-slate-900 dark:text-slate-100">{r.record_id}</strong>
                                    <Badge variant={r.tool === 'VALIDATE' ? 'success' : 'info'} className="text-[10px] py-0 px-1">
                                      {r.tool}
                                    </Badge>
                                    <span className="text-slate-600 dark:text-slate-400">{r.record_count}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{r.environment}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {parsedJobResult.unparseable.length > 0 && (
                            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-800 dark:text-rose-300 space-y-1">
                              <div className="font-semibold flex items-center gap-1 text-rose-700 dark:text-rose-400">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Unparseable clauses (never guessed):
                              </div>
                              <ul className="list-disc list-inside space-y-0.5 font-mono text-[10px]">
                                {parsedJobResult.unparseable.map((u, i) => (
                                  <li key={i}>{u}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {parsedJobResult.warnings.length > 0 && (
                            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                              {parsedJobResult.warnings.map((w, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>{w}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Part 2: CSV Import */}
                    <div className="space-y-3 p-3.5 rounded-lg border border-border bg-surface">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4 text-accent" />
                          <h4 className="text-[13px] font-bold text-text uppercase tracking-wider">
                            CSV Import
                          </h4>
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept=".csv,text/csv,text/plain"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-1 text-[13px]"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Choose .csv File
                        </Button>
                      </div>

                      <p className="text-[13px] text-muted">
                        Paste CSV lines with columns: <code>record_id, tool, record_count, environment</code> (max 10 rows).
                      </p>

                      <textarea
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        placeholder={"record_id,tool,record_count,environment\nJ01,EXPORT,250,STAGE\nJ02,VALIDATE,50,TEST"}
                        rows={3}
                        className="w-full text-[13px] font-mono p-2.5 rounded-lg border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-accent"
                      />

                      {csvError && (
                        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[13px] text-rose-700 dark:text-rose-300 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{csvError}</span>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleApplyCsv}
                          disabled={!csvText.trim()}
                          className="gap-1.5 text-[13px]"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Import CSV into Table
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Rows Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-muted uppercase tracking-wider">
                      Records ({records.length} of 10)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={history.length === 0}
                        title="Undo row edit (Ctrl+Z)"
                        aria-label="Undo row edit"
                        className="p-1 rounded text-muted hover:text-text hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        disabled={future.length === 0}
                        title="Redo row edit (Ctrl+Y)"
                        aria-label="Redo row edit"
                        className="p-1 rounded text-muted hover:text-text hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddRow}
                    disabled={records.length >= 10}
                    className="text-accent hover:text-accent/80 text-[13px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table
                    className="w-full text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
                    tabIndex={0}
                    aria-label="Job records input table"
                  >
                    <thead className="bg-surface-muted/60 text-muted font-semibold border-b border-border text-[13px]">
                      <tr>
                        <th className="py-2.5 px-1 w-7 text-center" title="Drag row handle to reorder"></th>
                        <th className="py-2.5 px-2 w-10 text-center">#</th>
                        <th className="py-2.5 px-2.5 min-w-[120px]">Record ID</th>
                        <th className="py-2.5 px-2.5 min-w-[140px] w-[145px]">Tool</th>
                        <th className="py-2.5 px-2.5 min-w-[90px] w-[95px]">Count</th>
                        <th className="py-2.5 px-2.5 min-w-[120px] w-[125px]">Env</th>
                        <th className="py-2.5 px-2 text-center w-16">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface text-[13px]">
                      {records.map((rec, idx) => {
                        const serverIssues = getRowIssues(idx + 1)
                        const clientIssues = clientValidation.issues.filter(
                          (iss) => iss.rowIndex === idx + 1
                        )
                        const hasServerIssue = serverIssues.length > 0
                        const hasClientIssue = clientIssues.length > 0 && !hasServerIssue

                        return (
                          <React.Fragment key={idx}>
                            <tr
                              onDragOver={(e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                if (dragOverIndex !== idx) setDragOverIndex(idx)
                              }}
                              onDragLeave={() => {
                                if (dragOverIndex === idx) setDragOverIndex(null)
                              }}
                              onDrop={(e) => {
                                e.preventDefault()
                                if (draggedIndex !== null && draggedIndex !== idx) {
                                  handleReorderRows(draggedIndex, idx)
                                }
                                setDraggedIndex(null)
                                setDragOverIndex(null)
                              }}
                              className={`transition-colors ${
                                dragOverIndex === idx
                                  ? 'border-t-2 border-accent bg-accent/10'
                                  : hasServerIssue
                                  ? 'bg-danger/10'
                                  : hasClientIssue
                                  ? 'bg-warning/10'
                                  : 'hover:bg-surface-muted/50'
                              } ${draggedIndex === idx ? 'opacity-30' : ''}`}
                            >
                              <td className="py-2 px-1 text-center text-muted">
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', String(idx))
                                    e.dataTransfer.effectAllowed = 'move'
                                    setDraggedIndex(idx)
                                  }}
                                  onDragEnd={() => {
                                    setDraggedIndex(null)
                                    setDragOverIndex(null)
                                  }}
                                  className="p-1 inline-flex items-center justify-center rounded hover:bg-surface-muted cursor-grab active:cursor-grabbing text-muted hover:text-text"
                                  title="Drag to reorder row"
                                  aria-label={`Drag to reorder row ${idx + 1}`}
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                              </td>
                              <td className="py-2 px-2 text-center text-muted font-mono text-[13px]">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="text"
                                  value={rec.record_id}
                                  aria-label={`Record ID row ${idx + 1}`}
                                  onChange={(e) => handleUpdateRecord(idx, 'record_id', e.target.value)}
                                  className={`w-full bg-surface-muted border rounded px-2.5 py-1.5 text-[13px] font-mono text-text focus:bg-surface focus:outline-none ${
                                    hasServerIssue
                                      ? 'border-danger ring-1 ring-danger'
                                      : hasClientIssue
                                      ? 'border-warning ring-1 ring-warning'
                                      : 'border-border focus:border-accent'
                                  }`}
                                />
                              </td>
                              <td className="py-1.5 px-2.5">
                                <select
                                  value={rec.tool}
                                  aria-label={`Tool row ${idx + 1}`}
                                  onChange={(e) => handleUpdateRecord(idx, 'tool', e.target.value)}
                                  className="w-full min-w-[130px] bg-surface-muted border border-border text-text rounded px-2.5 py-1.5 text-[13px] font-medium focus:bg-surface focus:outline-none focus:border-accent"
                                >
                                  <option value="EXPORT">EXPORT</option>
                                  <option value="VALIDATE">VALIDATE</option>
                                  <option value="DELETE">DELETE</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="text"
                                  value={rec.record_count}
                                  aria-label={`Record count row ${idx + 1}`}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    const trimmed = val.trim()
                                    const parsed = /^-?\d+$/.test(trimmed) ? parseInt(trimmed, 10) : val
                                    handleUpdateRecord(idx, 'record_count', parsed)
                                  }}
                                  className="w-full bg-surface-muted border border-border text-text rounded px-2.5 py-1.5 text-[13px] font-mono focus:bg-surface focus:outline-none focus:border-accent"
                                />
                              </td>
                              <td className="py-1.5 px-2.5">
                                <select
                                  value={rec.environment}
                                  aria-label={`Environment row ${idx + 1}`}
                                  onChange={(e) => handleUpdateRecord(idx, 'environment', e.target.value)}
                                  className="w-full min-w-[110px] bg-surface-muted border border-border text-text rounded px-2.5 py-1.5 text-[13px] font-medium focus:bg-surface focus:outline-none focus:border-accent"
                                >
                                  <option value="TEST">TEST</option>
                                  <option value="STAGE">STAGE</option>
                                  <option value="PROD">PROD</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateRow(idx)}
                                    disabled={records.length >= 10}
                                    title="Duplicate row"
                                    aria-label={`Duplicate row ${idx + 1}`}
                                    className="text-muted hover:text-accent disabled:opacity-20 p-1 rounded hover:bg-surface-muted cursor-pointer transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRow(idx)}
                                    disabled={records.length <= 1}
                                    title="Delete row"
                                    aria-label={`Delete row ${idx + 1}`}
                                    className="text-muted hover:text-danger disabled:opacity-20 p-1 rounded hover:bg-surface-muted cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {/* Server-returned error row */}
                            {hasServerIssue && (
                              <tr className="bg-danger/10 border-b border-danger/20">
                                <td colSpan={7} className="py-1 px-3 text-[11px] text-danger">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold">Row {idx + 1} Server Issue:</span>
                                    {serverIssues.map((iss, i) => (
                                      <Badge key={i} variant="danger" className="text-[10px]">
                                        {iss.rule_id} on {iss.field}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {/* Live client-side preview warnings when no server errors yet */}
                            {hasClientIssue && (
                              <tr className="bg-warning/10 border-b border-warning/20">
                                <td colSpan={7} className="py-1 px-3 text-[11px] text-warning">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold">Row {idx + 1} Preview:</span>
                                    {clientIssues.map((iss, i) => (
                                      <Badge key={i} variant="warn" className="text-[10px]">
                                        {iss.ruleId}: {iss.message}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Idempotency Key & Replay Demonstrator */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-slate-600 dark:text-slate-400">
                    Idempotency-Key
                  </label>
                  <label className="flex items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reuseLastKey}
                      onChange={(e) => setReuseLastKey(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    Reuse last key (test replay)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={reuseLastKey && lastSubmittedKey ? lastSubmittedKey : idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    disabled={reuseLastKey && !!lastSubmittedKey}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-[13px] font-mono text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRegenerateKey}
                    disabled={reuseLastKey && !!lastSubmittedKey}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    New
                  </Button>
                </div>
              </div>

              {/* Dev-only failure hook & Submit Button */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                {DEMO ? (
                  <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceFailure}
                      onChange={(e) => setForceFailure(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    Simulate failure (<code>X-Force-Failure: true</code>)
                  </label>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  {submitDisabledReason && (
                    <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
                      {submitDisabledReason}
                    </span>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSubmitting}
                    disabled={isSubmitting || records.length === 0 || isViewer || isSuspended}
                    className="gap-1.5 text-[13px]"
                    title={submitDisabledReason || 'Submit workload (Ctrl+Enter)'}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Submit Workload</span>
                    <span className="text-[11px] opacity-75 font-mono px-1 py-0.2 bg-indigo-700/60 rounded">
                      Ctrl+↵
                    </span>
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Result Panel & Visualizations */}
        <div className="space-y-4">
          {/* Printable Report Wrapper Container */}
          <div className="print-report-container space-y-4">
            {/* Header visible only when printed */}
            <div className="hidden print:block mb-4 pb-3 border-b border-slate-300">
              <h1 className="text-xl font-bold text-slate-900">WorkloadLens — Run Execution Report</h1>
              <div className="text-xs text-slate-600 mt-1 flex items-center justify-between">
                <div>
                  Tenant: <strong>{activeTokenOption.tenant}</strong> | Role: {activeTokenOption.role} | Plan: {planName}
                </div>
                <div>Generated: {new Date().toLocaleString()}</div>
              </div>
            </div>

            {/* REQUEST TIMELINE STRIP */}
            {responseStatus !== null && (
              <RequestTimelineStrip
                status={responseStatus}
                runStatus={lastRun?.status}
              />
            )}

            {isSubmitting ? (
              <Card className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <Clock className="w-4 h-4 animate-spin text-indigo-600" />
                  Executing workload run on server...
                </div>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-36 w-full" />
              </Card>
            ) : !responseStatus ? (
              <Card className="p-12 text-center text-slate-400">
                <Zap className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">No output yet</div>
                <div className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Configure your job batch on the left and submit (or press <code>Ctrl+Enter</code>) to view validation issues or workload estimation.
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Result Export Action Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-1">
                    Export Output
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadJson}
                      className="gap-1 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download JSON
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadCsv}
                      className="gap-1 text-xs"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Download CSV
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handlePrintReport}
                      className="gap-1 text-xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Report View
                    </Button>
                  </div>
                </div>

                {/* Plain words status banner with "What this means" */}
                {responseStatus && (
                  <div
                    className={`p-4 rounded-xl border space-y-1 ${
                      responseStatus === 201
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                        : responseStatus === 200
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300'
                        : responseStatus === 429
                        ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                        : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        {responseStatus === 201 && '201 Created — Run Accepted & Processed'}
                        {responseStatus === 200 && '200 OK — Idempotent Replay'}
                        {responseStatus === 400 && '400 Bad Request — Schema or Rule Violation'}
                        {responseStatus === 401 && '401 Unauthorized — Authentication Required'}
                        {responseStatus === 403 && '403 Forbidden — Insufficient Permissions'}
                        {responseStatus === 404 && '404 Not Found — Resource or Run Not Found'}
                        {responseStatus === 409 && '409 Conflict — RUN_IN_PROGRESS or Key Reuse'}
                        {responseStatus === 429 && '429 Quota Exceeded — Daily Limit Reached'}
                        {![200, 201, 400, 401, 403, 404, 409, 429].includes(responseStatus) &&
                          `HTTP ${responseStatus} Response`}
                      </div>
                      <Badge
                        variant={
                          responseStatus === 201 || responseStatus === 200
                            ? 'success'
                            : responseStatus === 429
                            ? 'warn'
                            : 'danger'
                        }
                      >
                        HTTP {responseStatus}
                      </Badge>
                    </div>
                    <div className="text-xs opacity-90 flex items-start gap-1 mt-1">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>What this means: </strong>
                        {responseStatus === 201 &&
                          'Workload was accepted into SQL, 1 quota slot debited, and execution completed.'}
                        {responseStatus === 200 &&
                          'Idempotent replay: this Idempotency-Key was previously processed. Replaying existing result with 0 quota debit.'}
                        {responseStatus === 400 &&
                          'Request violated structural bounds (bounds, schema, or process with invalid rows). 0 quota used.'}
                        {responseStatus === 401 &&
                          'Authentication token missing or invalid. Verify Bearer token credentials.'}
                        {responseStatus === 403 &&
                          'Permission denied: Viewer role cannot create runs, subscription suspended, or Basic plan cannot execute process.'}
                        {responseStatus === 404 &&
                          'Requested run ID, endpoint, or resource was not found.'}
                        {responseStatus === 409 &&
                          'Run with this key is currently in progress (RUN_IN_PROGRESS), or key was reused with a different payload.'}
                        {responseStatus === 429 &&
                          'Daily tenant quota exhausted (Basic: 3/day, Pro: 10/day). Resets at 00:00 UTC.'}
                      </span>
                    </div>
                  </div>
                )}



                {/* Succeeded Result View */}
                {lastRun && lastRun.status === 'Succeeded' && lastRun.result && (
                  <Card className="p-5 space-y-5">
                    {/* Validation Output */}
                    {lastRun.operation === 'validate' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">Valid Rows</div>
                            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              {lastRun.result.valid_rows}
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">Invalid Rows</div>
                            <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                              {lastRun.result.invalid_rows}
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                            <div className="text-[10px] font-bold text-slate-500 uppercase">Issues</div>
                            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                              {lastRun.result.issues?.length || 0}
                            </div>
                          </div>
                        </div>

                        {lastRun.result.issues && lastRun.result.issues.length > 0 ? (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold uppercase">
                                <tr>
                                  <th className="py-2 px-2.5">Row</th>
                                  <th className="py-2 px-2.5">Field</th>
                                  <th className="py-2 px-2.5">Rule ID</th>
                                  <th className="py-2 px-2.5">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                {lastRun.result.issues.map((iss: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-1.5 px-2.5">Row {iss.row_index}</td>
                                    <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-slate-100">{iss.field}</td>
                                    <td className="py-1.5 px-2.5 font-bold text-rose-600 dark:text-rose-400">{iss.rule_id}</td>
                                    <td className="py-1.5 px-2.5 font-sans text-slate-500 dark:text-slate-400 text-[11px]">
                                      {iss.rule_id === 'R1' && 'record_id nonempty <=20 chars, unique in batch'}
                                      {iss.rule_id === 'R2' && 'tool in {EXPORT, VALIDATE}'}
                                      {iss.rule_id === 'R3' && 'record_count integer 1..1000'}
                                      {iss.rule_id === 'R4' && 'environment in {TEST, STAGE}'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Validation clean: All records satisfy R1–R4 rules.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Processing Output: Summary + Cumulative Chart + Donut + Effort Table */}
                    {lastRun.operation === 'process' && (
                      <div className="space-y-6">
                        {/* Summary cards */}
                        {lastRun.result.summary && (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Input Rows</div>
                              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                                {lastRun.result.summary.input_rows}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Total Records</div>
                              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                {lastRun.result.summary.total_records}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Total Effort</div>
                              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {lastRun.result.summary.total_estimated_ms} ms
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Dual Charts Grid: Cumulative-time Area Chart + Tool Breakdown Donut */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* 1. Cumulative-Time Area Chart */}
                          <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                Cumulative Runtime Progression
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">
                                Total: {lastRun.result.summary?.total_estimated_ms || 0} ms
                              </span>
                            </div>
                            <div className="h-44 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={cumulativeTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                  <YAxis unit="ms" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    formatter={(value: any, name: any) => [
                                      `${value} ms`,
                                      name === 'cumulative_ms' ? 'Cumulative Time' : 'Step Effort',
                                    ]}
                                    labelFormatter={(label) => `Job ID: ${label}`}
                                    contentStyle={{
                                      backgroundColor: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      borderRadius: '8px',
                                      fontSize: '11px',
                                      color: 'var(--text)',
                                    }}
                                    itemStyle={{ color: 'var(--text)' }}
                                    labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="cumulative_ms"
                                    name="cumulative_ms"
                                    stroke="var(--accent)"
                                    fill="var(--accent)"
                                    fillOpacity={0.25}
                                    strokeWidth={2}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 2. Tool Breakdown Donut (EXPORT vs VALIDATE) */}
                          <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <PieIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                Tool Breakdown (Effort & Jobs)
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">
                                EXPORT vs VALIDATE
                              </span>
                            </div>
                            <div className="h-44 w-full">
                              {toolBreakdownData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={toolBreakdownData}
                                      cx="50%"
                                      cy="45%"
                                      innerRadius={36}
                                      outerRadius={58}
                                      paddingAngle={4}
                                      dataKey="value"
                                      nameKey="name"
                                    >
                                      {toolBreakdownData.map((entry, idx) => (
                                        <Cell key={`cell-${idx}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      formatter={(val: any, name: any, item: any) => [
                                        `${val} ms (${item.payload.count} jobs)`,
                                        name,
                                      ]}
                                      contentStyle={{
                                        backgroundColor: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        color: 'var(--text)',
                                      }}
                                      itemStyle={{ color: 'var(--text)' }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                                  </PieChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                  No tool breakdown data
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 3. Rows Table (record_id, estimated_ms, order preserved) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              Rows Table (Order Preserved)
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {lastRun.result.rows?.length || 0} rows
                            </span>
                          </div>

                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                                <tr>
                                  <th className="py-2 px-3 w-12 text-center">#</th>
                                  <th className="py-2 px-3 font-semibold">Record ID</th>
                                  <th className="py-2 px-3 w-28">Tool</th>
                                  <th className="py-2 px-3 text-right font-semibold">Estimated ms</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                {lastRun.result.rows?.map((r: any, idx: number) => {
                                  const ms = Number(r.estimated_ms) || 0
                                  const tool = toolLookup.get(r.record_id) || 'EXPORT'
                                  return (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                      <td className="py-1.5 px-3 text-center text-slate-400 font-bold">
                                        #{idx + 1}
                                      </td>
                                      <td className="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                                        {r.record_id}
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <Badge
                                          variant={tool === 'VALIDATE' ? 'success' : 'default'}
                                          className="text-[10px]"
                                        >
                                          {tool}
                                        </Badge>
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                        {ms} ms
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {/* Failed Run Recorded Error */}
                {lastRun && lastRun.status === 'Failed' && (
                  <Card className="p-4 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-1.5">
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Recorded Execution Error
                    </div>
                    <p className="font-mono text-xs text-danger bg-surface p-2.5 rounded border border-danger/30">
                      {lastRun.error || 'Execution failed'}
                    </p>
                  </Card>
                )}

                {/* Error Detail Display */}
                {rawErrorData && (
                  <Card className="p-4 bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 space-y-2">
                    <div className="text-xs font-bold text-rose-900 dark:text-rose-300">Error Payload</div>
                    <pre className="text-[11px] font-mono text-danger bg-surface p-2.5 rounded border border-danger/30 overflow-x-auto max-h-48">
                      {JSON.stringify(rawErrorData, null, 2)}
                    </pre>
                  </Card>
                )}

                {/* Collapsible Workload Advisor under the result */}
                {lastRun && lastRun.result && (
                  <div className="rounded-xl border border-border bg-surface shadow-2xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsAdvisorOpen((prev) => !prev)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-left text-[13px] font-semibold text-text hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        <span>Workload Advisor Insights</span>
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Smart suggestions
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-muted transition-transform duration-200 ${
                          isAdvisorOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isAdvisorOpen && (
                      <div className="p-3 border-t border-border">
                        <WorkloadAdvisor
                          operation={lastRun.operation}
                          result={lastRun.result}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Raw JSON with Copy Button */}
                {(lastRun || rawErrorData) && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1"
                      >
                        {showRawJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Raw JSON Response
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyJson(lastRun || rawErrorData)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy JSON
                      </Button>
                    </div>
                    {showRawJson && (
                      <pre className="mt-2 text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-60">
                        {JSON.stringify(lastRun || rawErrorData, null, 2)}
                      </pre>
                    )}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Demo Scenarios Drawer */}
      {isDemoDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Interactive Demo Scenarios"
          className="fixed inset-0 z-50 overflow-hidden"
        >
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDemoDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-surface shadow-2xl flex flex-col border-l border-border">
              {/* Drawer Header */}
              <div className="p-5 border-b border-border bg-surface-muted/50 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    <h2 className="text-base font-bold text-text">
                      Interactive Demo Scenarios
                    </h2>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Live verification running REAL backend HTTP requests. PASS/FAIL computed directly from real responses.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDemoDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action bar */}
              <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  9 Live Verification Scenarios
                </span>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={runAllScenarios}
                  isLoading={isRunningAll}
                  className="gap-1.5 text-xs"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Run All Scenarios
                </Button>
              </div>

              {/* Scenarios List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
                {DEMO_SCENARIOS.map((sc, idx) => {
                  const res = scenarioResults[sc.id]
                  const isRunning = runningScenarioId === sc.id

                  return (
                    <div
                      key={sc.id}
                      className="p-4 rounded-xl border border-border bg-surface hover:border-accent/40 transition-all space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {idx + 1}. {sc.title}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              Expected: {sc.expected}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{sc.desc}</p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => runScenarioById(sc.id)}
                          isLoading={isRunning}
                          disabled={isRunning || isRunningAll}
                          className="text-xs shrink-0"
                        >
                          Run
                        </Button>
                      </div>

                      {/* Real Result Output */}
                      {res && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={res.pass ? 'success' : 'danger'}>
                              {res.pass ? 'PASS' : 'FAIL'}
                            </Badge>
                            <Badge variant="default" className="font-mono text-[10px]">
                              HTTP {res.status}
                            </Badge>
                            <span className="text-slate-600 dark:text-slate-400 text-[11px]">{res.details}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
