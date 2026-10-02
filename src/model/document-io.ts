import { appendLayout, extractLayout } from './layout-comment'
import type { Point } from './types'

export interface SheetSnapshot {
  id: string
  name: string
  dbml: string
  positions: Record<string, Point>
  routes: Record<string, Point[]>
  hiddenInferences: string[]
}

export interface DocumentSnapshot {
  sheets: SheetSnapshot[]
  activeSheetId: string
}

const SHEETS_BEGIN = '// @er-studio-sheets v1'
const SHEETS_END = '// @er-studio-sheets-end'
const SHEET_BEGIN = /^\/\/ @sheet id=(\S+) name=(.*)$/
const SHEET_END = '// @sheet-end'

export function newSheetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function defaultSheet(name = '页 1'): SheetSnapshot {
  return {
    id: newSheetId(),
    name,
    dbml: '',
    positions: {},
    routes: {},
    hiddenInferences: [],
  }
}

export function singleSheetDocument(dbml: string, name = '页 1'): DocumentSnapshot {
  const sheet = defaultSheet(name)
  sheet.dbml = dbml
  return { sheets: [sheet], activeSheetId: sheet.id }
}

export function parseDocumentFile(text: string): DocumentSnapshot {
  const trimmed = text.replace(/^\uFEFF/, '')
  if (!trimmed.includes(SHEETS_BEGIN)) {
    const extracted = extractLayout(trimmed)
    const sheet = defaultSheet('页 1')
    sheet.dbml = extracted.dbml
    sheet.positions = extracted.positions
    sheet.routes = extracted.routes
    sheet.hiddenInferences = extracted.hiddenInferences
    return { sheets: [sheet], activeSheetId: sheet.id }
  }

  const lines = trimmed.split(/\r?\n/)
  const begin = lines.findIndex((line) => line.trim() === SHEETS_BEGIN)
  const end = lines.findIndex((line, index) => index > begin && line.trim() === SHEETS_END)
  if (begin < 0 || end < 0) {
    const extracted = extractLayout(trimmed)
    const sheet = defaultSheet('页 1')
    sheet.dbml = extracted.dbml
    sheet.positions = extracted.positions
    sheet.routes = extracted.routes
    sheet.hiddenInferences = extracted.hiddenInferences
    return { sheets: [sheet], activeSheetId: sheet.id }
  }

  const sheets: SheetSnapshot[] = []
  let activeSheetId = ''
  let current: SheetSnapshot | null = null
  const body: string[] = []

  const flush = () => {
    if (!current) return
    const chunk = body.join('\n').replace(/\s+$/, '')
    body.length = 0
    const extracted = extractLayout(chunk)
    current.dbml = extracted.dbml
    current.positions = extracted.positions
    current.routes = extracted.routes
    current.hiddenInferences = extracted.hiddenInferences
    sheets.push(current)
    current = null
  }

  for (let index = begin + 1; index < end; index += 1) {
    const line = lines[index]
    if (line.startsWith('// @active ')) {
      activeSheetId = line.slice('// @active '.length).trim()
      continue
    }
    const sheetMatch = line.match(SHEET_BEGIN)
    if (sheetMatch) {
      flush()
      current = {
        id: sheetMatch[1],
        name: decodeSheetName(sheetMatch[2]),
        dbml: '',
        positions: {},
        routes: {},
        hiddenInferences: [],
      }
      continue
    }
    if (line.trim() === SHEET_END) {
      flush()
      continue
    }
    if (current) body.push(line)
  }
  flush()

  if (sheets.length === 0) return singleSheetDocument('')
  if (!activeSheetId || !sheets.some((sheet) => sheet.id === activeSheetId)) {
    activeSheetId = sheets[0].id
  }
  return { sheets, activeSheetId }
}

function encodeSheetName(name: string): string {
  return JSON.stringify(name)
}

function decodeSheetName(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' && parsed.trim() ? parsed : '未命名页'
  } catch {
    return raw.trim() || '未命名页'
  }
}

export function serializeDocumentFile(doc: DocumentSnapshot): string {
  if (doc.sheets.length <= 1) {
    const sheet = doc.sheets[0] ?? defaultSheet()
    return appendLayout(sheet.dbml, sheet.positions, sheet.routes, sheet.hiddenInferences)
  }

  const parts = [SHEETS_BEGIN, `// @active ${doc.activeSheetId}`]
  for (const sheet of doc.sheets) {
    parts.push(`// @sheet id=${sheet.id} name=${encodeSheetName(sheet.name)}`)
    parts.push(appendLayout(sheet.dbml, sheet.positions, sheet.routes, sheet.hiddenInferences).replace(/\s+$/, ''))
    parts.push(SHEET_END)
  }
  parts.push(SHEETS_END)
  return `${parts.join('\n')}\n`
}

export function migrateLegacyDraft(input: {
  dbml: string
  positions?: Record<string, Point>
  routes?: Record<string, Point[]>
  hiddenInferences?: string[]
}): DocumentSnapshot {
  const sheet = defaultSheet('页 1')
  const extracted = extractLayout(input.dbml)
  sheet.dbml = extracted.dbml
  sheet.positions = input.positions ?? extracted.positions
  sheet.routes = input.routes ?? extracted.routes
  sheet.hiddenInferences = input.hiddenInferences ?? extracted.hiddenInferences
  return { sheets: [sheet], activeSheetId: sheet.id }
}
