import {
  UC05JobRecord,
  UC05Subscription,
  UC05WorkloadRun,
} from '../types'

export const DEMO = import.meta.env.VITE_DEMO_MODE !== '0'

const API_BASE = '/api'

let currentToken = (() => {
  try {
    return localStorage.getItem('workloadlens-token') || 'dev-token-a-operator'
  } catch {
    return 'dev-token-a-operator'
  }
})()

export function setApiToken(token: string) {
  currentToken = token
  try {
    localStorage.setItem('workloadlens-token', token)
  } catch {}
}

export function getApiToken(): string {
  try {
    const saved = localStorage.getItem('workloadlens-token')
    if (saved) return saved
  } catch {}
  return currentToken
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function formatApiErrorMessage(status: number, data: any): string {
  const detail = data?.detail
  let detailMsg = ''
  if (typeof detail === 'string') {
    detailMsg = detail
  } else if (detail && typeof detail === 'object') {
    if (detail.message) {
      detailMsg = detail.message
    } else if (detail.issues) {
      detailMsg = `Validation failed with ${detail.issues.length} issue(s).`
    } else {
      detailMsg = JSON.stringify(detail)
    }
  }

  switch (status) {
    case 400:
      return `400 Bad Request: ${detailMsg || 'Invalid request structure, missing fields, or validation rules failed.'}`
    case 401:
      return `401 Unauthorized: ${detailMsg || 'Missing or invalid authentication token.'}`
    case 403:
      return `403 Forbidden: ${detailMsg || 'Action not permitted for current role, plan, or subscription status.'}`
    case 409:
      return `409 Conflict: ${detailMsg || 'Idempotency conflict: key already used or run in progress.'}`
    case 429:
      return `429 Daily Limit Reached: ${detailMsg || 'Daily quota exhausted for this tenant. Limit resets at 00:00 UTC.'}`
    default:
      return `${status} Error: ${detailMsg || 'An error occurred during request execution.'}`
  }
}

export async function checkHealth(): Promise<{ status: string; ok: boolean; httpStatus: number }> {
  try {
    // Use the exact same base path as the other calls
    const res = await fetch(`${API_BASE}/health`)
    const isOk = res.status === 200
    const data = await res.json().catch(() => ({}))
    return { status: isOk ? (data.status || 'ok') : 'error', ok: isOk, httpStatus: res.status }
  } catch {
    // Fallback to /health in case static is mounted without /api
    try {
      const fallback = await fetch('/health')
      const isOk = fallback.status === 200
      const data = await fallback.json().catch(() => ({}))
      return { status: isOk ? (data.status || 'ok') : 'error', ok: isOk, httpStatus: fallback.status }
    } catch {
      return { status: 'offline', ok: false, httpStatus: 0 }
    }
  }
}

export async function getSubscription(token?: string): Promise<UC05Subscription> {
  const activeToken = token || getApiToken()
  const res = await fetch(`${API_BASE}/subscription`, {
    headers: { Authorization: `Bearer ${activeToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(res.status, data), res.status, data)
  }
  return data
}

export interface ToolsApiResponse {
  tools: Array<{
    name: string
    description: string
    environments: string[]
  }>
  allowed_operations: string[]
  rate_ms_per_record: number
}

export async function getTools(token?: string): Promise<ToolsApiResponse> {
  const activeToken = token || getApiToken()
  const res = await fetch(`${API_BASE}/tools`, {
    headers: { Authorization: `Bearer ${activeToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(res.status, data), res.status, data)
  }
  return data
}

export async function createWorkloadRun(
  operation: 'validate' | 'process',
  records: UC05JobRecord[],
  idempotencyKey: string,
  token?: string,
  forceFailure: boolean = false
): Promise<UC05WorkloadRun> {
  const activeToken = token || getApiToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${activeToken}`,
    'Idempotency-Key': idempotencyKey,
  }
  if (forceFailure) {
    headers['X-Force-Failure'] = 'true'
  }

  // NOTE: Strictly never send tenant_id in body
  const res = await fetch(`${API_BASE}/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation, records }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(res.status, data), res.status, data)
  }
  data.http_status = res.status
  return data
}

export async function getWorkloadRuns(token?: string): Promise<UC05WorkloadRun[]> {
  const activeToken = token || getApiToken()
  const res = await fetch(`${API_BASE}/runs`, {
    headers: { Authorization: `Bearer ${activeToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(res.status, data), res.status, data)
  }
  return data
}

export async function getWorkloadRunResult(
  runId: string,
  token?: string
): Promise<UC05WorkloadRun> {
  const activeToken = token || getApiToken()
  const res = await fetch(`${API_BASE}/runs/${runId}/result`, {
    headers: { Authorization: `Bearer ${activeToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(res.status, data), res.status, data)
  }
  return data
}
