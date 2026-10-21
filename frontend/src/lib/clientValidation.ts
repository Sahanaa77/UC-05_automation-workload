import { UC05JobRecord } from '../types'

export interface ClientValidationIssue {
  rowIndex: number // 1-indexed
  field: string
  ruleId: 'R1' | 'R2' | 'R3' | 'R4'
  message: string
}

export interface ClientValidationPreview {
  validCount: number
  invalidCount: number
  issues: ClientValidationIssue[]
  isValid: boolean
}

export function validateRecordsClientPreview(records: UC05JobRecord[]): ClientValidationPreview {
  const issues: ClientValidationIssue[] = []
  const seenIds = new Set<string>()
  const invalidRowIndices = new Set<number>()

  records.forEach((row, idx) => {
    const rowIndex = idx + 1
    let rowHasIssue = false

    // R1: record_id non-empty, <= 20 chars, unique in batch (only later occurrences fail)
    const rawId = row.record_id
    if (!rawId || typeof rawId !== 'string') {
      issues.push({ rowIndex, field: 'record_id', ruleId: 'R1', message: 'Record ID is required' })
      rowHasIssue = true
    } else {
      const trimmed = rawId.trim()
      if (trimmed.length === 0) {
        issues.push({ rowIndex, field: 'record_id', ruleId: 'R1', message: 'Record ID cannot be empty' })
        rowHasIssue = true
      } else if (trimmed.length > 20) {
        issues.push({ rowIndex, field: 'record_id', ruleId: 'R1', message: 'Record ID exceeds 20 characters' })
        rowHasIssue = true
      } else if (seenIds.has(trimmed)) {
        issues.push({ rowIndex, field: 'record_id', ruleId: 'R1', message: `Duplicate Record ID '${trimmed}'` })
        rowHasIssue = true
      } else {
        seenIds.add(trimmed)
      }
    }

    // R2: tool in {'EXPORT', 'VALIDATE'}
    const tool = row.tool ? String(row.tool).trim() : ''
    if (tool !== 'EXPORT' && tool !== 'VALIDATE') {
      issues.push({ rowIndex, field: 'tool', ruleId: 'R2', message: 'Tool must be EXPORT or VALIDATE' })
      rowHasIssue = true
    }

    // R3: record_count is int 1..1000
    const count = Number(row.record_count)
    if (isNaN(count) || !Number.isInteger(count) || count < 1 || count > 1000) {
      issues.push({ rowIndex, field: 'record_count', ruleId: 'R3', message: 'Count must be integer 1 to 1000' })
      rowHasIssue = true
    }

    // R4: environment in {'TEST', 'STAGE'}
    const env = row.environment ? String(row.environment).trim() : ''
    if (env !== 'TEST' && env !== 'STAGE') {
      issues.push({ rowIndex, field: 'environment', ruleId: 'R4', message: 'Environment must be TEST or STAGE' })
      rowHasIssue = true
    }

    if (rowHasIssue) {
      invalidRowIndices.add(rowIndex)
    }
  })

  const invalidCount = invalidRowIndices.size
  const validCount = records.length - invalidCount

  return {
    validCount,
    invalidCount,
    issues,
    isValid: invalidCount === 0 && records.length > 0,
  }
}
