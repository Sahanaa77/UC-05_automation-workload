import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  ArrowUpDown,
  PieChart as PieIcon,
  TrendingUp,
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
const CircularQuotaGauge: React.FC<{ used: number; limit: number; remaining: number }> = ({
  used,
  limit,
  remaining,
}) => {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 72 72">
          <circle
            cx="36"
            cy="36"
            r={radius}
            className="text-slate-100 dark:text-slate-800"
            strokeWidth="7"
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="36"
            cy="36"
            r={radius}
            className={remaining === 0 ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400'}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
          />
        </svg>
        <span className="absolute text-xs font-extrabold text-slate-800 dark:text-slate-200">
          {remaining}
        </span>
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {remaining} remaining
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
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

  // Execution & results state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<UC05WorkloadRun | null>(null)
  const [rawErrorData, setRawErrorData] = useState<any>(null)
  const [validationIssues, setValidationIssues] = useState<any[]>([])
  const [showRawJson, setShowRawJson] = useState<boolean>(false)

  // CSV Import Modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false)
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

  const loadData = async () => {
    setStatsLoading(true)
    try {
      const [sub, tools] = await Promise.all([
        getSubscription(token),
        getTools(token),
      ])
      setSubscription(sub)
      setToolsData(tools)
    } catch (err: any) {
      console.error(err)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
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
  const isBasic = planName === 'Basic'

  const handleUpdateRecord = (index: number, field: keyof UC05JobRecord, value: any) => {
    const updated = [...records]
    updated[index] = { ...updated[index], [field]: value }
    setRecords(updated)
  }

  const handleAddRow = () => {
    if (records.length >= 10) return
    const nextNum = records.length + 1
    const nextId = `J${String(nextNum).padStart(2, '0')}`
    setRecords([
      ...records,
      { record_id: nextId, tool: 'EXPORT', record_count: 10, environment: 'TEST' },
    ])
  }

  const handleRemoveRow = (index: number) => {
    if (records.length <= 1) return
    setRecords(records.filter((_, i) => i !== index))
  }

  const handleLoadValid = () => {
    setRecords(VALID_FIXTURE_RECORDS)
    toast('Loaded valid fixture (2 rows)', undefined, 'info')
  }

  const handleLoadInvalid = () => {
    setRecords(INVALID_FIXTURE_RECORDS)
    toast('Loaded invalid fixture (6 rows)', undefined, 'warn')
  }

  const handleLoadEleven = () => {
    setRecords(ELEVEN_ROWS_FIXTURE)
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
      toast('Batch Limit Reached', 'Batch is already at the maximum of 10 rows', 'error')
      return
    }
    const toAdd = parsedJobResult.records.slice(0, remainingSlots)
    setRecords((prev) => [...prev, ...toAdd])
    if (parsedJobResult.records.length > remainingSlots) {
      toast(
        'Rows Added (Capped)',
        `Added ${toAdd.length} rows (capped at batch limit of 10 rows)`,
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
    executeSubmit()
  }

  // Keyboard shortcut: Ctrl+Enter or Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!isSubmitting && records.length > 0) {
          executeSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, records, operation, idempotencyKey, reuseLastKey, lastSubmittedKey, forceFailure, token])

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
    setRecords(result.records)
    setRawErrorData(null)
    setValidationIssues([])
    setLastRun(null)
    setResponseStatus(null)
    setIsCsvModalOpen(false)
    setCsvText('')

    if (result.warning) {
      toast('CSV Imported with Warning', result.warning, 'warn')
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
      { name: 'EXPORT', value: exportEffort, count: exportCount, color: '#6366f1' },
      { name: 'VALIDATE', value: validateEffort, count: validateCount, color: '#10b981' },
    ].filter((d) => d.count > 0 || d.value > 0)
  }, [lastRun, toolLookup])

  // Effort sorted table
  const effortSortedRows = useMemo(() => {
    if (!lastRun?.result?.rows) return []
    return [...lastRun.result.rows].sort(
      (a: any, b: any) => (Number(b.estimated_ms) || 0) - (Number(a.estimated_ms) || 0)
    )
  }, [lastRun])

  const maxEffort = useMemo(() => {
    if (!effortSortedRows.length) return 1
    return Math.max(...effortSortedRows.map((r: any) => Number(r.estimated_ms) || 0), 1)
  }, [effortSortedRows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Run Tools"
        description="Configure job records to preview workload validation or execute runtime estimations."
        icon={<Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        breadcrumbs={[
          { label: 'WorkloadLens', href: '#/tools' },
          { label: 'Run Tools' },
        ]}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsDemoDrawerOpen(true)}
            className="gap-1.5 shadow-2xs border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Demo Scenarios
          </Button>
        }
      />

      {/* ------------------------------------------------------------------- */}
      {/* TOP ROW: 3 STAT CARDS                                               */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Plan */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Tenant Plan
            </div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
              {planName}
              <Badge variant={subStatus === 'Active' ? 'success' : 'danger'}>
                {subStatus}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Role: <strong className="text-slate-700 dark:text-slate-300">{activeTokenOption.role}</strong>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 2: Remaining runs today (Circular gauge) */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Daily Quota Gauge
            </div>
            {statsLoading ? (
              <Skeleton className="w-32 h-12" />
            ) : (
              <CircularQuotaGauge
                used={usedToday}
                limit={dailyQuota}
                remaining={remainingQuota}
              />
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </Card>

        {/* Card 3: Allowed operations */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Allowed Operations
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-1.5 flex-wrap">
              {(toolsData?.allowed_operations || (planName === 'Pro' ? ['validate', 'process'] : ['validate'])).map(
                (op) => (
                  <Badge
                    key={op}
                    variant={op === 'process' ? 'info' : 'default'}
                    className="font-mono uppercase text-xs"
                  >
                    {op}
                  </Badge>
                )
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Request Builder */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Header & Operation Toggle */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Request Builder</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure workload batch</p>
                </div>

                {/* Operation Toggle */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setOperation('validate')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      operation === 'validate'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Validate
                  </button>
                  <div className="relative group">
                    <button
                      type="button"
                      disabled={isBasic}
                      onClick={() => !isBasic && setOperation('process')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        isBasic
                          ? 'opacity-40 cursor-not-allowed text-slate-400'
                          : operation === 'process'
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Process
                    </button>
                    {isBasic && (
                      <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[10px] py-0.5 px-2 rounded whitespace-nowrap shadow-md z-30">
                        Upgrade to Pro
                      </span>
                    )}
                  </div>
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="gap-1 text-slate-700 dark:text-slate-300"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    CSV Import
                  </Button>
                </div>

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
              </div>

              {/* LIVE CLIENT-SIDE VALIDATION PREVIEW BAR */}
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between flex-wrap gap-2 transition-all ${
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

              {/* "Describe your jobs" Smart Builder Card */}
              <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Describe your jobs
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Smart builder - rule-based, runs in your browser
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Type job requirements in plain text (e.g. <em>&quot;export 500 records in stage as J10; validate 40 records in test as J11&quot;</em>).
                </p>

                <textarea
                  value={jobPromptText}
                  onChange={(e) => setJobPromptText(e.target.value)}
                  placeholder="export 500 records in stage as J10; validate 40 records in test as J11"
                  rows={2}
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateRows}
                    disabled={!jobPromptText.trim()}
                    className="gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/50"
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
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to table ({parsedJobResult.records.length})
                    </Button>
                  )}
                </div>

                {/* Preview of Generated Rows & Unparseable Warnings */}
                {parsedJobResult && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    {/* Generated preview chips */}
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

                    {/* Warnings & Unparseable parts */}
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

              {/* Editable Rows Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Records ({records.length} of 10)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddRow}
                    disabled={records.length >= 10}
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table
                    className="w-full text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
                    tabIndex={0}
                    aria-label="Job records input table"
                  >
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2.5">Record ID</th>
                        <th className="py-2 px-2.5 w-24">Tool</th>
                        <th className="py-2 px-2.5 w-20">Count</th>
                        <th className="py-2 px-2.5 w-24">Env</th>
                        <th className="py-2 px-1 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
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
                              className={
                                hasServerIssue
                                  ? 'bg-rose-50/50 dark:bg-rose-950/30'
                                  : hasClientIssue
                                  ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                  : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                              }
                            >
                              <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="text"
                                  value={rec.record_id}
                                  onChange={(e) => handleUpdateRecord(idx, 'record_id', e.target.value)}
                                  className={`w-full bg-slate-50 dark:bg-slate-800 border rounded px-2 py-1 text-xs font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none ${
                                    hasServerIssue
                                      ? 'border-rose-400 ring-1 ring-rose-400'
                                      : hasClientIssue
                                      ? 'border-amber-400 ring-1 ring-amber-400'
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                />
                              </td>
                              <td className="py-1.5 px-2.5">
                                <select
                                  value={rec.tool}
                                  onChange={(e) => handleUpdateRecord(idx, 'tool', e.target.value)}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
                                >
                                  <option value="EXPORT">EXPORT</option>
                                  <option value="VALIDATE">VALIDATE</option>
                                  <option value="DELETE">DELETE</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="number"
                                  value={rec.record_count}
                                  onChange={(e) =>
                                    handleUpdateRecord(idx, 'record_count', parseInt(e.target.value, 10) || 0)
                                  }
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
                                />
                              </td>
                              <td className="py-1.5 px-2.5">
                                <select
                                  value={rec.environment}
                                  onChange={(e) => handleUpdateRecord(idx, 'environment', e.target.value)}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
                                >
                                  <option value="TEST">TEST</option>
                                  <option value="STAGE">STAGE</option>
                                  <option value="PROD">PROD</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(idx)}
                                  disabled={records.length <= 1}
                                  className="text-slate-400 hover:text-rose-600 disabled:opacity-20 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                            {/* Server-returned error row */}
                            {hasServerIssue && (
                              <tr className="bg-rose-50/70 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900/40">
                                <td colSpan={6} className="py-1 px-3 text-[11px] text-rose-700 dark:text-rose-300">
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
                              <tr className="bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40">
                                <td colSpan={6} className="py-1 px-3 text-[11px] text-amber-700 dark:text-amber-300">
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
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Idempotency-Key
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
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
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
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
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceFailure}
                    onChange={(e) => setForceFailure(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                  />
                  Simulate failure (<code>X-Force-Failure: true</code>)
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  disabled={isSubmitting || records.length === 0}
                  className="gap-1.5"
                  title="Submit workload (Ctrl+Enter)"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Submit Workload</span>
                  <span className="text-[10px] opacity-75 font-mono px-1 py-0.2 bg-indigo-700/60 rounded">
                    Ctrl+↵
                  </span>
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: Result Panel & Visualizations */}
        <div className="lg:col-span-6 space-y-4">
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
                      {responseStatus === 201 && '201 Created & Accepted'}
                      {responseStatus === 200 && '200 OK — Idempotent Replay'}
                      {responseStatus === 400 && '400 Bad Request'}
                      {responseStatus === 401 && '401 Unauthorized'}
                      {responseStatus === 403 && '403 Forbidden'}
                      {responseStatus === 409 && '409 Conflict (RUN_IN_PROGRESS / Key Reuse)'}
                      {responseStatus === 429 && '429 Daily Quota Exhausted'}
                      {![200, 201, 400, 401, 403, 409, 429].includes(responseStatus) &&
                        `${responseStatus} Response`}
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
                        'Same Idempotency-Key matched an earlier run; returning existing result with 0 additional quota debit.'}
                      {responseStatus === 400 &&
                        'Request violated structural bounds (bounds, schema, or process with invalid rows). 0 quota used.'}
                      {responseStatus === 401 &&
                        'Authentication token missing or invalid. Verify Bearer token credentials.'}
                      {responseStatus === 403 &&
                        'Permission denied: Viewer role cannot create runs, subscription suspended, or Basic plan cannot execute process.'}
                      {responseStatus === 409 &&
                        'Run with this key is currently in progress, or key was reused with a different payload.'}
                      {responseStatus === 429 &&
                        'Daily tenant limit reached (Basic: 3/day, Pro: 10/day). Resets at 00:00 UTC.'}
                    </span>
                  </div>
                </div>

                {/* Workload Advisor Card */}
                {lastRun && lastRun.result && (
                  <WorkloadAdvisor
                    operation={lastRun.operation}
                    result={lastRun.result}
                  />
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

                        {/* 3. Table Sorted by Effort (estimated_ms descending) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              Job Effort Breakdown (Sorted by Effort Descending)
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {effortSortedRows.length} jobs analyzed
                            </span>
                          </div>

                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                                <tr>
                                  <th className="py-2 px-3 w-12 text-center">Rank</th>
                                  <th className="py-2 px-3">Record ID</th>
                                  <th className="py-2 px-3 w-28">Tool</th>
                                  <th className="py-2 px-3 text-right">Effort (ms)</th>
                                  <th className="py-2 px-3 w-36">Relative Share</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                {effortSortedRows.map((r: any, idx: number) => {
                                  const ms = Number(r.estimated_ms) || 0
                                  const tool = toolLookup.get(r.record_id) || 'EXPORT'
                                  const pct = Math.round((ms / maxEffort) * 100)
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
                                      <td className="py-1.5 px-3">
                                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                          <div
                                            className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
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
                    <p className="font-mono text-xs text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-900 p-2.5 rounded border border-rose-200 dark:border-rose-800">
                      {lastRun.error || 'Execution failed'}
                    </p>
                  </Card>
                )}

                {/* Error Detail Display */}
                {rawErrorData && (
                  <Card className="p-4 bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 space-y-2">
                    <div className="text-xs font-bold text-rose-900 dark:text-rose-300">Error Payload</div>
                    <pre className="text-[11px] font-mono text-rose-800 dark:text-rose-200 bg-white dark:bg-slate-900 p-2.5 rounded border border-rose-200 dark:border-rose-800 overflow-x-auto max-h-48">
                      {JSON.stringify(rawErrorData, null, 2)}
                    </pre>
                  </Card>
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

      {/* CSV Import Modal */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCsvModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Import CSV Rows
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p>
                Paste CSV text below or upload a .csv file. Header row is optional. Max 10 rows (batch boundary).
              </p>
              <p className="font-mono text-[11px] bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                record_id,tool,record_count,environment<br />
                J01,EXPORT,20,TEST<br />
                J02,VALIDATE,10,STAGE
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  CSV Content
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1 text-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                  </Button>
                </div>
              </div>

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="record_id,tool,record_count,environment&#10;J01,EXPORT,25,TEST&#10;J02,VALIDATE,15,STAGE"
                rows={6}
                className="w-full font-mono text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
            </div>

            {csvError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                {csvError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCsvModalOpen(false)
                  setCsvText('')
                  setCsvError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApplyCsv}
                disabled={!csvText.trim()}
                className="gap-1"
              >
                <Check className="w-4 h-4" />
                Import & Clear Previous Errors
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Scenarios Drawer */}
      {isDemoDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDemoDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Interactive Demo Scenarios
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Live verification running REAL backend HTTP requests. PASS/FAIL computed directly from real responses.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDemoDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action bar */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
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
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5 shadow-2xs"
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
