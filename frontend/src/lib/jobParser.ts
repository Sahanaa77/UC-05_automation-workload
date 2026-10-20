import { UC05JobRecord } from '../types'

export interface ParsedJobClause {
  record_id: string
  tool: 'EXPORT' | 'VALIDATE'
  record_count: number
  environment: 'TEST' | 'STAGE'
  rawClause: string
}

export interface JobParseResult {
  records: UC05JobRecord[]
  unparseable: string[]
  warnings: string[]
}

/**
 * Deterministic rule-based parser that converts natural language text into job records.
 * Examples:
 *   "export 500 records in stage as J10; validate 40 records in test as J11"
 *   "export 25 records as J01\nvalidate 50 in stage"
 *
 * Defaults:
 *   - Environment: TEST
 *   - Record ID: J01, J02, ... (auto-incremented if omitted)
 *
 * Unparseable parts are reported explicitly, never guessed.
 */
export function parseJobsFromText(
  text: string,
  existingCount: number = 0
): JobParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { records: [], unparseable: [], warnings: [] }
  }

  // Split clauses by semicolons, newlines, or multiple spaces + "and then"
  const rawClauses = trimmed
    .split(/;|\r?\n|\band\s+then\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)

  const records: UC05JobRecord[] = []
  const unparseable: string[] = []
  const warnings: string[] = []
  let autoIdCounter = existingCount + 1

  const seenIds = new Set<string>()

  for (const clause of rawClauses) {
    // 1. Tool extraction: must explicitly be EXPORT or VALIDATE
    let tool: 'EXPORT' | 'VALIDATE' | null = null
    if (/\bexport\b/i.test(clause)) {
      tool = 'EXPORT'
    } else if (/\bvalidate\b/i.test(clause)) {
      tool = 'VALIDATE'
    }

    if (!tool) {
      unparseable.push(
        `"${clause}": missing required tool ('export' or 'validate')`
      )
      continue
    }

    // 2. Count extraction: look for positive integer
    const countMatch = clause.match(/\b(\d+)\s*(?:records?|rows?|items?|jobs?)?\b/i)
    let recordCount: number | null = null
    if (countMatch && countMatch[1]) {
      const parsedCount = parseInt(countMatch[1], 10)
      if (!isNaN(parsedCount) && parsedCount > 0) {
        recordCount = parsedCount
      }
    }

    if (recordCount === null) {
      unparseable.push(
        `"${clause}": could not extract valid record count (positive integer required)`
      )
      continue
    }

    if (recordCount > 1000) {
      warnings.push(
        `Row count ${recordCount} in "${clause}" was clamped to maximum allowed 1000 records.`
      )
      recordCount = 1000
    }

    // 3. Environment extraction: TEST or STAGE (defaults to TEST if omitted)
    let environment: 'TEST' | 'STAGE' = 'TEST'
    if (/\b(?:in|on|env(?:ironment)?\s+)?stage\b/i.test(clause)) {
      environment = 'STAGE'
    } else if (/\b(?:in|on|env(?:ironment)?\s+)?test\b/i.test(clause)) {
      environment = 'TEST'
    } else if (/\b(?:in|on|env(?:ironment)?\s+)?prod(?:uction)?\b/i.test(clause)) {
      unparseable.push(
        `"${clause}": PROD environment is invalid (only TEST and STAGE permitted)`
      )
      continue
    }

    // 4. Record ID extraction: e.g. "as J10", "id J10", "named J10"
    let recordId: string | null = null
    const idMatch = clause.match(
      /\b(?:as|id|named|record_id)\s+([A-Za-z0-9_-]{1,20})\b/i
    )
    if (idMatch && idMatch[1]) {
      recordId = idMatch[1].trim()
    } else {
      // Auto ID
      while (seenIds.has(`J${String(autoIdCounter).padStart(2, '0')}`)) {
        autoIdCounter++
      }
      recordId = `J${String(autoIdCounter).padStart(2, '0')}`
      autoIdCounter++
    }

    if (seenIds.has(recordId)) {
      // If duplicate in batch, warn and append suffix
      const uniqueId = `${recordId}_${records.length + 1}`.slice(0, 20)
      warnings.push(
        `Duplicate Record ID "${recordId}" adjusted to "${uniqueId}" to preserve batch uniqueness.`
      )
      recordId = uniqueId
    }
    seenIds.add(recordId)

    records.push({
      record_id: recordId,
      tool,
      record_count: recordCount,
      environment,
    })
  }

  return { records, unparseable, warnings }
}
