// ---------------------------------------------------------------------------
// Pure deterministic functions for Validate and Process results
// ---------------------------------------------------------------------------

export interface RuleInsight {
  ruleId: string
  ruleTitle: string
  explanation: string
  concreteFix: string
  affectedRows: number[]
  count: number
}

export interface ValidateAdvice {
  readinessScore: number // 0 to 100 percentage
  validRows: number
  invalidRows: number
  totalRows: number
  ruleInsights: RuleInsight[]
  summarySentence: string
}

export interface ProcessShareRow {
  record_id: string
  estimated_ms: number
  sharePercent: number
}

export interface ProcessAdvice {
  effortLevel: 'Low' | 'Medium' | 'High'
  effortDescription: string
  totalEstimatedMs: number
  totalRecords: number
  inputRows: number
  heaviestJob: ProcessShareRow | null
  rowsShare: ProcessShareRow[]
  teachingRuleNote: string
}

/**
 * Pure deterministic advisor for validate results.
 * Explains each violated rule in one sentence with a concrete fix:
 * - R1: duplicate or too long ID
 * - R2: tool must be EXPORT or VALIDATE
 * - R3: count 1-1000 integer
 * - R4: TEST or STAGE
 * plus readiness score = valid_rows / total rows.
 */
export function analyzeValidateResult(result: any): ValidateAdvice | null {
  if (!result || typeof result.valid_rows !== 'number') return null

  const validRows = Number(result.valid_rows) || 0
  const invalidRows = Number(result.invalid_rows) || 0
  const totalRows = validRows + invalidRows
  const readinessScore = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 100

  const ruleSpecs: Record<string, { title: string; explanation: string; fix: string }> = {
    R1: {
      title: 'Identifier uniqueness / length',
      explanation: 'Record ID is either duplicate within the batch or exceeds 32 characters.',
      fix: 'Assign a unique, nonempty record_id under 32 characters for every row.',
    },
    R2: {
      title: 'Supported tool type',
      explanation: 'Specified tool is not supported by the preview runner.',
      fix: 'Set tool to either EXPORT or VALIDATE.',
    },
    R3: {
      title: 'Record count bounds',
      explanation: 'Record count is not a valid integer within the allowed bounds.',
      fix: 'Set record_count to an integer between 1 and 1000.',
    },
    R4: {
      title: 'Allowed environment',
      explanation: 'Target environment is invalid or not allowed for preview execution.',
      fix: 'Set environment to either TEST or STAGE (PROD is not permitted).',
    },
  }

  const issues: Array<{ row_index: number; field: string; rule_id: string }> = result.issues || []
  const grouped: Record<string, number[]> = {}

  for (const iss of issues) {
    const rId = iss.rule_id || 'Unknown'
    if (!grouped[rId]) grouped[rId] = []
    grouped[rId].push(iss.row_index)
  }

  const ruleInsights: RuleInsight[] = Object.keys(grouped).map((rId) => {
    const spec = ruleSpecs[rId] || {
      title: `Rule ${rId}`,
      explanation: `Violation of rule ${rId}.`,
      fix: 'Verify row fields match schema expectations.',
    }
    return {
      ruleId: rId,
      ruleTitle: spec.title,
      explanation: spec.explanation,
      concreteFix: spec.fix,
      affectedRows: grouped[rId],
      count: grouped[rId].length,
    }
  })

  const summarySentence =
    readinessScore === 100
      ? 'All batch rows meet schema invariants and are 100% ready for process execution.'
      : `${invalidRows} of ${totalRows} rows require corrections before processing (${readinessScore}% readiness).`

  return {
    readinessScore,
    validRows,
    invalidRows,
    totalRows,
    ruleInsights,
    summarySentence,
  }
}

/**
 * Pure deterministic advisor for process results.
 * Computes:
 * - share of time per record
 * - the heaviest job
 * - note that estimate is a fixed 10 ms/record teaching rule and not a performance promise
 * - effort level (Low <500 ms, Medium <5 s, High otherwise)
 */
export function analyzeProcessResult(result: any): ProcessAdvice | null {
  if (!result || !result.summary) return null

  const summary = result.summary
  const totalEstimatedMs = Number(summary.total_estimated_ms) || 0
  const totalRecords = Number(summary.total_records) || 0
  const inputRows = Number(summary.input_rows) || 0
  const rows: Array<{ record_id: string; estimated_ms: number }> = result.rows || []

  // Effort level classification
  let effortLevel: 'Low' | 'Medium' | 'High' = 'Low'
  let effortDescription = 'Fast batch: execution estimate is under 500 ms.'
  if (totalEstimatedMs >= 5000) {
    effortLevel = 'High'
    effortDescription = 'Substantial batch: estimate is 5,000 ms or higher.'
  } else if (totalEstimatedMs >= 500) {
    effortLevel = 'Medium'
    effortDescription = 'Moderate batch: estimate is between 500 ms and 5,000 ms.'
  }

  // Share of time per record
  const rowsShare: ProcessShareRow[] = rows.map((r) => {
    const ms = Number(r.estimated_ms) || 0
    const sharePercent =
      totalEstimatedMs > 0 ? Math.round((ms / totalEstimatedMs) * 1000) / 10 : 0
    return {
      record_id: r.record_id,
      estimated_ms: ms,
      sharePercent,
    }
  })

  // Heaviest job
  let heaviestJob: ProcessShareRow | null = null
  if (rowsShare.length > 0) {
    heaviestJob = rowsShare.reduce((prev, curr) =>
      curr.estimated_ms > prev.estimated_ms ? curr : prev
    )
  }

  const teachingRuleNote =
    'The estimate is a fixed 10 ms/record teaching rule and not a performance promise.'

  return {
    effortLevel,
    effortDescription,
    totalEstimatedMs,
    totalRecords,
    inputRows,
    heaviestJob,
    rowsShare,
    teachingRuleNote,
  }
}
