export function downloadFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportJson(filename: string, data: any) {
  const content = JSON.stringify(data, null, 2)
  downloadFile(`${filename}.json`, content, 'application/json')
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ]
  downloadFile(`${filename}.csv`, lines.join('\n'), 'text/csv;charset=utf-8;')
}
