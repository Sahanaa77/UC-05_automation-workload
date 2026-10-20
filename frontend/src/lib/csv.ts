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
    warning = `CSV contains ${parsedRows.length} rows. Only the first 10 rows were imported (maximum batch boundary).`
    parsedRows = parsedRows.slice(0, 10)
  }

  const records: UC05JobRecord[] = []
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i]
    if (row.length === 0 || (row.length === 1 && !row[0])) continue

    const recordId = row[idIdx] ? String(row[idIdx]).trim() : `J${String(i + 1).padStart(2, '0')}`
    const rawTool = row[toolIdx] ? String(row[toolIdx]).trim().toUpperCase() : 'EXPORT'
    const tool = rawTool === 'VALIDATE' ? 'VALIDATE' : 'EXPORT'
    const rawCount = row[countIdx] ? parseInt(String(row[countIdx]).replace(/[^0-9]/g, ''), 10) : 10
    const recordCount = isNaN(rawCount) || rawCount <= 0 ? 10 : Math.min(1000, rawCount)
    const rawEnv = row[envIdx] ? String(row[envIdx]).trim().toUpperCase() : 'TEST'
    const environment = rawEnv === 'STAGE' ? 'STAGE' : 'TEST'

    records.push({
      record_id: recordId,
      tool: tool as 'EXPORT' | 'VALIDATE',
      record_count: recordCount,
      environment: environment as 'TEST' | 'STAGE',
    })
  }

  if (records.length === 0) {
    return { records: [], error: 'Failed to extract valid job records from CSV' }
  }

  return { records, warning }
}
