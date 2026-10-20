import { UC05JobRecord } from '../types'

export interface CsvParseResult {
  records: UC05JobRecord[]
  error?: string
  warning?: string
}

export function parseJobRecordsCsv(rawCsv: string): CsvParseResult {
  const trimmed = rawCsv.trim()
  if (!trimmed) {
    return { records: [], error: 'CSV content is empty' }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return { records: [], error: 'No data lines found in CSV' }
  }

  // Tokenize CSV rows
  const rows: string[][] = lines.map((line) => {
    const tokens: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        tokens.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    tokens.push(current.trim())
    return tokens
  })

  // Detect header row
  let startIndex = 0
  const firstRow = rows[0].map((c) => c.toLowerCase().replace(/[^a-z0-9_]/g, ''))
  const hasHeader =
    firstRow.some((c) => c.includes('record') || c.includes('tool') || c.includes('env') || c.includes('count'))

  let idIdx = 0
  let toolIdx = 1
  let countIdx = 2
  let envIdx = 3

  if (hasHeader) {
    startIndex = 1
    const h = firstRow
    const foundId = h.findIndex((c) => c === 'recordid' || c === 'record_id' || c === 'id')
    const foundTool = h.findIndex((c) => c === 'tool' || c === 'operation')
    const foundCount = h.findIndex((c) => c === 'recordcount' || c === 'record_count' || c === 'count')
    const foundEnv = h.findIndex((c) => c === 'environment' || c === 'env')

    if (foundId !== -1) idIdx = foundId
    if (foundTool !== -1) toolIdx = foundTool
    if (foundCount !== -1) countIdx = foundCount
    if (foundEnv !== -1) envIdx = foundEnv
  }

  const dataRows = rows.slice(startIndex)
  if (dataRows.length === 0) {
    return { records: [], error: 'CSV contains only headers and no data records' }
  }

  let warning: string | undefined
  let parsedRows = dataRows

  if (parsedRows.length > 10) {
    warning = `CSV contains ${parsedRows.length} rows. Maximum batch limit is 10 rows; only the first 10 rows were imported.`
    parsedRows = parsedRows.slice(0, 10)
  }

  const records: UC05JobRecord[] = []
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i]
    if (row.length === 0 || (row.length === 1 && !row[0])) continue

    // Keep original case of record_id, trimmed
    const rawId = row[idIdx] !== undefined ? String(row[idIdx]).trim() : ''
    const recordId = rawId !== '' ? rawId : `J${String(i + 1).padStart(2, '0')}`

    // Trim other fields
    const rawTool = row[toolIdx] !== undefined ? String(row[toolIdx]).trim() : ''
    const tool = rawTool !== '' ? rawTool.toUpperCase() : 'EXPORT'

    // Convert record_count to real integer if whole number; keep original text if not
    const rawCountStr = row[countIdx] !== undefined ? String(row[countIdx]).trim() : ''
    let recordCount: number | string = 10
    if (rawCountStr === '') {
      recordCount = 10
    } else if (/^-?\d+$/.test(rawCountStr)) {
      recordCount = parseInt(rawCountStr, 10)
    } else {
      recordCount = rawCountStr
    }

    const rawEnv = row[envIdx] !== undefined ? String(row[envIdx]).trim() : ''
    const environment = rawEnv !== '' ? rawEnv.toUpperCase() : 'TEST'

    records.push({
      record_id: recordId,
      tool,
      record_count: recordCount,
      environment,
    })
  }

  if (records.length === 0) {
    return { records: [], error: 'Failed to extract valid job records from CSV' }
  }

  return { records, warning }
}
