import { UC05JobRecord } from '../types'

export interface ParsedJobClause {
  record_id: string
  tool: 'EXPORT' | 'VALIDATE' | string
  record_count: number | string
  environment: 'TEST' | 'STAGE' | string
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
    // 1. Tool extraction: must explicitly be EXPORT or VALIDATE (trimmed)
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

    // 2. Count extraction:
    // Extract count token (e.g. "export 250 records", "validate 40 in test", "export 25.5 records")
    let rawCountToken: string | null = null
    const recordsMatch = clause.match(/\b([^\s;]+)\s+(?:records?|rows?|items?|jobs?)\b/i)
    const countPrefixMatch = clause.match(/\b(?:count|records?|rows?)[:\s]+([^\s;]+)/i)
    const afterToolMatch = clause.match(/\b(?:export|validate)\s+([^\s;]+)/i)

    if (
      recordsMatch &&
      recordsMatch[1] &&
      !/^(?:export|validate|in|on|at|as|stage|test|prod)$/i.test(recordsMatch[1])
    ) {
      rawCountToken = recordsMatch[1].trim()
    } else if (countPrefixMatch && countPrefixMatch[1]) {
      rawCountToken = countPrefixMatch[1].trim()
    } else if (
      afterToolMatch &&
      afterToolMatch[1] &&
      !/^(?:in|on|at|as|stage|test|prod|records?|rows?|items?|jobs?)$/i.test(afterToolMatch[1])
    ) {
      rawCountToken = afterToolMatch[1].trim()
    }

    let recordCount: number | string
    if (rawCountToken !== null) {
      if (/^-?\d+$/.test(rawCountToken)) {
        // Whole number -> real integer
        recordCount = parseInt(rawCountToken, 10)
      } else {
        // If not a whole number, keep original text so server R3 check flags it
        recordCount = rawCountToken
      }
    } else {
      unparseable.push(`"${clause}": could not extract record count`)
      continue
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

    // 4. Record ID extraction: e.g. "as J10", "id J10", "named J10" (keep original case, trimmed)
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

  // Enforce 10-row limit with clear message
  if (records.length > 10) {
    warnings.push(
      `Plain-English builder generated ${records.length} jobs. Maximum batch limit is 10 rows; only the first 10 rows were kept.`
    )
    records.splice(10)
  }

  return { records, unparseable, warnings }
}
