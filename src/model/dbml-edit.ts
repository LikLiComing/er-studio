import { dbmlIdent } from './parse'
import type { TextSpan } from './text-edit'
import { applySpan } from './text-edit'

export interface FieldLineParts {
  name: string
  typeName: string
  settings: string[]
  note: string
}

const COMMON_TYPES = [
  'int',
  'bigint',
  'varchar(255)',
  'text',
  'boolean',
  'decimal(10,2)',
  'date',
  'timestamp',
  'json',
  'uuid',
]

export function commonFieldTypes(enumNames: string[]): string[] {
  const names = enumNames.filter(Boolean)
  return [...COMMON_TYPES, ...names.filter((name) => !COMMON_TYPES.includes(name))]
}

export function lineSpan(text: string, line: number, nextLine = ''): TextSpan {
  const lines = text.split('\n')
  const content = lines[line - 1] ?? ''
  return {
    line,
    column: 1,
    endLine: line,
    endColumn: content.length + 1,
    text: nextLine,
  }
}

export function replaceLine(text: string, line: number, nextLine: string): string {
  return applySpan(text, lineSpan(text, line, nextLine))
}

export function parseFieldLine(line: string): FieldLineParts | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('Note:') || trimmed.startsWith('indexes')) return null
  const match = trimmed.match(/^("(?:\\.|[^"])*"|[^\s[]+)(?:\s+([^\s[]+))?(?:\s*(\[[\s\S]*\]))?\s*$/)
  if (!match) return null
  const name = unquote(match[1])
  const typeName = match[2] ? unquote(match[2]) : 'varchar'
  const settingsRaw = match[3]?.slice(1, -1) ?? ''
  const settings: string[] = []
  let note = ''
  for (const token of splitSettings(settingsRaw)) {
    const noteMatch = token.match(/^note:\s*'((?:\\.|[^'\\])*)'$/i)
    if (noteMatch) {
      note = noteMatch[1].replace(/\\'/g, "'")
      continue
    }
    settings.push(token.trim())
  }
  return { name, typeName, settings, note }
}

export function buildFieldLine(parts: FieldLineParts): string {
  const settings = [...parts.settings]
  if (parts.note.trim()) {
    const escaped = parts.note.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    settings.push(`note: '${escaped}'`)
  }
  const name = needsQuote(parts.name) ? `"${parts.name.replace(/"/g, '\\"')}"` : parts.name
  const typeName = parts.typeName.trim() || 'varchar'
  const settingText = settings.length > 0 ? ` [${settings.join(', ')}]` : ''
  return `  ${name} ${typeName}${settingText}`
}

export function fieldHasSetting(parts: FieldLineParts, key: string): boolean {
  const lower = key.toLowerCase()
  return parts.settings.some((item) => item.toLowerCase() === lower || item.toLowerCase().startsWith(`${lower}:`))
}

export function toggleFieldSetting(parts: FieldLineParts, key: string): FieldLineParts {
  const lower = key.toLowerCase()
  const next = parts.settings.filter((item) => {
    const token = item.toLowerCase()
    return token !== lower && !token.startsWith(`${lower}:`)
  })
  if (!fieldHasSetting(parts, key)) next.push(key)
  return { ...parts, settings: next }
}

export function tableBlockRange(text: string, tableLine: number): { start: number; end: number } | null {
  const lines = text.split('\n')
  let open = -1
  for (let index = tableLine - 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (open < 0 && line.includes('{')) open = index
    if (open >= 0 && line.includes('}')) return { start: open + 1, end: index + 1 }
  }
  return null
}

export function renameTableLine(text: string, tableLine: number, tableName: string, schemaName?: string): TextSpan {
  const line = text.split('\n')[tableLine - 1] ?? ''
  const id = schemaName && schemaName !== 'public' ? `${schemaName}.${tableName}` : tableName
  const next = line.replace(/^(\s*Table\s+)([^\s[{]+)/, `$1${dbmlIdent(id)}`)
  return lineSpan(text, tableLine, next)
}

export function setTableNote(text: string, tableLine: number, note: string): TextSpan {
  const block = tableBlockRange(text, tableLine)
  if (!block) return lineSpan(text, tableLine, text.split('\n')[tableLine - 1] ?? '')
  const lines = text.split('\n')
  for (let line = block.start; line <= block.end; line += 1) {
    if (/^\s*Note:/i.test(lines[line - 1] ?? '')) {
      const indent = lines[line - 1].match(/^\s*/)?.[0] ?? '  '
      const escaped = note.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return lineSpan(text, line, note.trim() ? `${indent}Note: '${escaped}'` : '')
    }
  }
  const insertAt = block.end
  const escaped = note.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const noteLine = `  Note: '${escaped}'`
  const current = lines[insertAt - 1] ?? ''
  return {
    line: insertAt,
    column: 1,
    endLine: insertAt,
    endColumn: current.length + 1,
    text: `\n${noteLine}\n${current}`,
  }
}

export function insertFieldLine(text: string, tableLine: number, parts: FieldLineParts): TextSpan {
  const block = tableBlockRange(text, tableLine)
  const insertLine = block?.end ?? tableLine + 1
  return {
    line: insertLine,
    column: 1,
    endLine: insertLine,
    endColumn: 1,
    text: `${buildFieldLine(parts)}\n`,
  }
}

export function deleteFieldLine(text: string, line: number): TextSpan {
  const lines = text.split('\n')
  if (line < 1 || line > lines.length) return lineSpan(text, 1, '')
  if (line < lines.length) {
    return { line, column: 1, endLine: line + 1, endColumn: 1, text: '' }
  }
  if (line === 1) return lineSpan(text, 1, '')
  const prev = lines[line - 2].length + 1
  return { line: line - 1, column: prev, endLine: line, endColumn: lines[line - 1].length + 1, text: '' }
}

export function renameFieldOnLine(line: string, nextName: string): string {
  const parts = parseFieldLine(line)
  if (!parts) return line
  return buildFieldLine({ ...parts, name: nextName })
}

export function updateFieldLine(line: string, patch: Partial<FieldLineParts>): string {
  const parts = parseFieldLine(line)
  if (!parts) return line
  return buildFieldLine({ ...parts, ...patch, settings: patch.settings ?? parts.settings })
}

export function newTableBlock(name: string): string {
  const id = dbmlIdent(name)
  return `Table ${id} {\n  id int [pk]\n}\n`
}

function splitSettings(raw: string): string[] {
  const items: string[] = []
  let current = ''
  let quote = false
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (char === "'" && raw[index - 1] !== '\\') quote = !quote
    if (char === ',' && !quote) {
      if (current.trim()) items.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) items.push(current.trim())
  return items
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"')
  return value
}

function needsQuote(name: string): boolean {
  return !/^[A-Za-z_]\w*$/.test(name)
}
