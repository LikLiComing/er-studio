import type { EnumView, SchemaModel } from './types'

export function formatEnumLegend(item: EnumView): string {
  return item.values.map((value) => {
    if (value.note.trim()) return `${value.name}（${value.note.trim()}）`
    return value.name
  }).join('；')
}

function escapeDbmlNote(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function appendFieldNote(line: string, addon: string, enumName: string): string {
  if (line.includes(addon) || (line.includes('枚举') && line.includes(enumName))) return line
  const merged = escapeDbmlNote(addon)
  const noteMatch = line.match(/\[note:\s*'((?:\\.|[^'\\])*)'\s*\]/)
  if (noteMatch) {
    const existing = noteMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    const next = existing.includes(addon) ? existing : `${existing} · ${addon}`
    return line.replace(noteMatch[0], `[note: '${escapeDbmlNote(next)}']`)
  }
  const trimmed = line.replace(/\s+$/, '')
  if (trimmed.endsWith(',')) {
    return `${trimmed.slice(0, -1)} [note: '${merged}'],`
  }
  return `${trimmed} [note: '${merged}']`
}

export function buildEnumSqlHeader(model: SchemaModel): string {
  if (model.enums.length === 0) return ''
  const lines = model.enums.map((item) => `-- ${item.name}: ${formatEnumLegend(item)}`)
  return `-- ER Studio 枚举说明\n${lines.join('\n')}\n\n`
}

export function enrichDbmlForSqlExport(dbml: string, model: SchemaModel): string {
  if (model.enumLinks.length === 0) return dbml
  const enumById = new Map(model.enums.map((item) => [item.id, item]))
  const lines = dbml.split(/\r?\n/)
  for (const link of model.enumLinks) {
    const item = enumById.get(link.enumId)
    if (!item) continue
    const table = model.tables.find((entry) => entry.id === link.tableId)
    const field = table?.fields.find((entry) => entry.name === link.field)
    if (!field) continue
    const index = field.line - 1
    if (index < 0 || index >= lines.length) continue
    const addon = `枚举 ${item.name}：${formatEnumLegend(item)}`
    lines[index] = appendFieldNote(lines[index], addon, item.name)
  }
  return lines.join('\n')
}
