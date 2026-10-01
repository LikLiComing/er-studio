import { Parser } from '@dbml/core'
import { neutralizeOptional, type OptionalMark } from './optional'
import { HEADER_PALETTE, type Cardinality, type ParseIssue, type ParseResult, type RefEnd, type SchemaModel } from './types'

interface TokenRange {
  start: { line: number; column: number }
  end: { line: number; column: number }
}

interface RawEndpoint {
  schemaName?: string | null
  tableName: string
  fieldNames: string[]
  relation: string
}

interface RawField {
  name: string
  type?: { type_name?: string } | string
  pk?: boolean
  unique?: boolean
  not_null?: boolean
  increment?: boolean
  note?: string | null
  token?: TokenRange
}

interface RawIndex {
  name?: string
  unique?: boolean
  columns?: { value?: string }[]
}

interface RawTable {
  name: string
  schema?: { name?: string }
  headerColor?: string
  note?: string | null
  token?: TokenRange
  fields?: RawField[]
  indexes?: RawIndex[]
}

interface RawEnum {
  name: string
  schema?: { name?: string }
  token?: TokenRange
  values?: { name: string; note?: string | null }[]
}

interface RawRef {
  name?: string | null
  color?: string
  token?: TokenRange
  endpoints?: RawEndpoint[]
}

interface RawSchema {
  name?: string
  tables?: RawTable[]
  enums?: RawEnum[]
  refs?: RawRef[]
}

interface RawDatabase {
  hasDefaultSchema?: boolean
  schemas?: RawSchema[]
}

const parser = new Parser()

export function parseDbml(source: string): ParseResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: true, model: { tables: [], enums: [], refs: [] } }
  }

  const { text, marks } = neutralizeOptional(source)
  try {
    const database = parser.parse(text, 'dbmlv2') as RawDatabase
    return { ok: true, model: toModel(database, text, marks) }
  } catch (error) {
    return { ok: false, issues: readIssues(error) }
  }
}

export function dbmlIdent(name: string): string {
  return name
    .split('.')
    .map((part) => (/^[A-Za-z_][\w]*$/.test(part) ? part : `"${part.replace(/"/g, '\\"')}"`))
    .join('.')
}

export function locateNode(model: SchemaModel, line: number): { id: string; kind: 'table' | 'enum' | 'ref' } | null {
  const ref = model.refs.find((item) => item.line === line)
  if (ref) return { id: ref.id, kind: 'ref' }
  for (const table of model.tables) {
    if (table.line === line || table.fields.some((field) => field.line === line)) {
      return { id: table.id, kind: 'table' }
    }
  }
  const item = model.enums.find((entry) => entry.line === line)
  if (item) return { id: item.id, kind: 'enum' }
  return null
}

function toModel(database: RawDatabase, source: string, marks: OptionalMark[]): SchemaModel {
  const schemas = database.schemas ?? []
  const schemaNames = new Set(schemas.map((schema) => schema.name || 'public'))
  const qualify = schemaNames.size > 1
  const tables = schemas.flatMap((schema) => schema.tables ?? [])
  const enums = schemas.flatMap((schema) => schema.enums ?? [])
  const refs = schemas.flatMap((schema) => schema.refs ?? [])

  const tableViews = tables.map((table, index) => {
    const id = nodeId(table.schema?.name, table.name, qualify)
    return {
      id,
      name: table.name,
      headerColor: normalizeColor(table.headerColor) || HEADER_PALETTE[index % HEADER_PALETTE.length],
      note: table.note || '',
      line: table.token?.start.line ?? 1,
      fields: (table.fields ?? []).map((field) => ({
        name: field.name,
        typeName: typeName(field.type),
        pk: field.pk === true,
        unique: field.unique === true,
        notNull: field.not_null === true,
        increment: field.increment === true,
        note: field.note || '',
        line: field.token?.start.line ?? table.token?.start.line ?? 1,
      })),
      indexes: (table.indexes ?? []).map((index) => ({
        label: indexLabel(index),
      })),
    }
  })

  const colorById = new Map(tableViews.map((table) => [table.id, table.headerColor]))
  const fieldByKey = new Map(
    tables.flatMap((table) =>
      (table.fields ?? []).map((field) => {
        const id = nodeId(table.schema?.name, table.name, qualify)
        return [`${id}.${field.name}`, field] as const
      }),
    ),
  )

  const explicitRefViews = refs.flatMap((ref, index) => {
    const endpoints = ref.endpoints ?? []
    if (endpoints.length < 2) return []
    const sides = sourceSides(source, ref.token, endpoints, qualify)
    if (!sides) return []
    const mark = markFor(ref.token, marks)
    const fromOptional = mark ? mark.left : inferredOptional(sides.left, sides.right, fieldByKey, qualify)
    const toOptional = mark ? mark.right : inferredOptional(sides.right, sides.left, fieldByKey, qualify)
    const from = endOf(sides.left, qualify)
    const to = endOf(sides.right, qualify)
    if (!from || !to) return []
    const fromCard: Cardinality = { many: sides.left.relation === '*', optional: fromOptional }
    const toCard: Cardinality = { many: sides.right.relation === '*', optional: toOptional }
    return [{
      id: `${from.tableId}.${from.fields.join('+')}->${to.tableId}.${to.fields.join('+')}#${index}`,
      name: ref.name || '',
      color: normalizeColor(ref.color) || colorById.get(from.tableId) || '#94a3b8',
      line: ref.token?.start.line ?? 1,
      from,
      to,
      fromCard,
      toCard,
    }]
  })

  const refViews = [
    ...explicitRefViews,
    ...inferForeignKeyRefs(tableViews, explicitRefViews),
  ]

  return {
    tables: tableViews,
    enums: enums.map((item) => ({
      id: nodeId(item.schema?.name, item.name, qualify),
      name: item.name,
      line: item.token?.start.line ?? 1,
      values: (item.values ?? []).map((value) => ({
        name: value.name,
        note: value.note || '',
      })),
    })),
    refs: refViews,
  }
}

/**
 * Infer a relationship when a child field follows the conventional
 * `${tableName}_id` foreign-key name. This keeps DBML concise while still
 * giving the diagram the same relationship metadata as an explicit Ref.
 */
function inferForeignKeyRefs(tableViews: SchemaModel['tables'], existing: SchemaModel['refs']): SchemaModel['refs'] {
  const inferred: SchemaModel['refs'] = []
  for (const child of tableViews) {
    for (const field of child.fields) {
      const suffix = '_id'
      if (!field.name.toLowerCase().endsWith(suffix)) continue
      const targetName = field.name.slice(0, -suffix.length)
      if (!targetName) continue
      const candidates = tableViews.filter((table) => table.id !== child.id && foreignKeyTargets(targetName, table.name))
      if (candidates.length === 0) continue
      const childSchema = schemaPart(child.id)
      const target = candidates.find((table) => schemaPart(table.id) === childSchema) ?? candidates[0]
      const targetField = target.fields.find((candidate) => candidate.name.toLowerCase() === 'id')
      if (!targetField || hasSameEndpoints(existing, inferred, child.id, field.name, target.id, targetField.name)) continue
      inferred.push({
        id: `${child.id}.${field.name}->${target.id}.${targetField.name}#auto`,
        name: '',
        color: child.headerColor,
        line: field.line,
        from: { tableId: child.id, fields: [field.name] },
        to: { tableId: target.id, fields: [targetField.name] },
        fromCard: { many: true, optional: !field.notNull },
        toCard: { many: false, optional: false },
      })
    }
  }
  return inferred
}

function hasSameEndpoints(
  existing: SchemaModel['refs'],
  inferred: SchemaModel['refs'],
  fromTableId: string,
  fromField: string,
  toTableId: string,
  toField: string,
): boolean {
  return [...existing, ...inferred].some((ref) =>
    (ref.from.tableId === fromTableId && ref.from.fields.length === 1 && ref.from.fields[0] === fromField
      && ref.to.tableId === toTableId && ref.to.fields.length === 1 && ref.to.fields[0] === toField)
    || (ref.from.tableId === toTableId && ref.from.fields.length === 1 && ref.from.fields[0] === toField
      && ref.to.tableId === fromTableId && ref.to.fields.length === 1 && ref.to.fields[0] === fromField),
  )
}

function schemaPart(id: string): string {
  const index = id.lastIndexOf('.')
  return index < 0 ? 'public' : id.slice(0, index)
}

function foreignKeyTargets(prefix: string, tableName: string): boolean {
  const expected = prefix.toLowerCase()
  const name = tableName.toLowerCase()
  if (expected === name) return true
  // Common schemas use singular FK names (`user_id`) for plural tables
  // (`users`). Keep the exact convention above as the primary rule, while
  // accepting this harmless spelling variant for existing DBML files.
  if (!name.endsWith('s') || name.endsWith('ss') || name.endsWith('us') || name.endsWith('is')) return false
  if (name.endsWith('ies')) return expected === `${name.slice(0, -3)}y`
  return expected === name.slice(0, -1)
}

function sourceSides(
  source: string,
  token: TokenRange | undefined,
  endpoints: RawEndpoint[],
  qualify: boolean,
): { left: RawEndpoint; right: RawEndpoint } | null {
  if (!token) {
    return { left: endpoints[0], right: endpoints[1] }
  }
  const slice = sliceToken(source, token)
  const found = findOperator(slice)
  if (!found) return { left: endpoints[0], right: endpoints[1] }
  const leftText = slice.slice(0, found.index)
  const rightText = slice.slice(found.index + found.op.length)
  const right = endpoints.find((endpoint) => mentions(rightText, endpoint))
  const left = endpoints.find((endpoint) => endpoint !== right && mentions(leftText, endpoint))
    ?? endpoints.find((endpoint) => endpoint !== right)
  if (!left || !right) return null
  void qualify
  return { left, right }
}

function mentions(text: string, endpoint: RawEndpoint): boolean {
  if (!text.includes(endpoint.tableName)) return false
  return endpoint.fieldNames.every((field) => text.includes(field))
}

function endOf(endpoint: RawEndpoint, qualify: boolean): RefEnd | null {
  if (!endpoint.tableName || endpoint.fieldNames.length === 0) return null
  return {
    tableId: nodeId(endpoint.schemaName, endpoint.tableName, qualify),
    fields: [...endpoint.fieldNames],
  }
}

function inferredOptional(
  side: RawEndpoint,
  other: RawEndpoint,
  fields: Map<string, RawField>,
  qualify: boolean,
): boolean {
  if (side.relation !== '1' || other.relation !== '*') return false
  const key = `${nodeId(other.schemaName, other.tableName, qualify)}.${other.fieldNames[0]}`
  const field = fields.get(key)
  return !field || field.not_null !== true
}

function markFor(token: TokenRange | undefined, marks: OptionalMark[]): OptionalMark | undefined {
  if (!token) return undefined
  return marks.find((mark) => contains(token, mark.line, mark.column))
}

function contains(token: TokenRange, line: number, column: number): boolean {
  const afterStart = line > token.start.line || (line === token.start.line && column >= token.start.column)
  const beforeEnd = line < token.end.line || (line === token.end.line && column <= token.end.column)
  return afterStart && beforeEnd
}

function sliceToken(source: string, token: TokenRange): string {
  const lines = source.split(/\r?\n/)
  const start = token.start.line - 1
  const end = token.end.line - 1
  if (start < 0 || start >= lines.length) return ''
  if (start === end) {
    return lines[start].slice(token.start.column - 1, token.end.column - 1)
  }
  const chunks = [lines[start].slice(token.start.column - 1)]
  for (let line = start + 1; line < end; line += 1) chunks.push(lines[line] ?? '')
  chunks.push((lines[end] ?? '').slice(0, Math.max(0, token.end.column - 1)))
  return chunks.join('\n')
}

function findOperator(slice: string): { index: number; op: string } | null {
  const match = slice.match(/<>|<|>|-/)
  if (!match || match.index === undefined) return null
  return { index: match.index, op: match[0] }
}

function nodeId(schemaName: string | null | undefined, name: string, qualify: boolean): string {
  const schema = schemaName || 'public'
  if (!qualify || schema === 'public') return name
  return `${schema}.${name}`
}

function typeName(type: RawField['type']): string {
  if (!type) return ''
  if (typeof type === 'string') return type
  return type.type_name || ''
}

function indexLabel(index: RawIndex): string {
  const columns = (index.columns ?? []).map((column) => column.value || '').filter(Boolean).join(', ')
  const name = index.name ? `${index.name}: ` : ''
  const unique = index.unique ? ' unique' : ''
  return `${name}${columns}${unique}`
}

function normalizeColor(value: string | undefined): string {
  if (!value) return ''
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : ''
}

function readIssues(error: unknown): ParseIssue[] {
  const diags = (error as { diags?: unknown }).diags
  if (!Array.isArray(diags) || diags.length === 0) {
    const message = error instanceof Error ? error.message : '无法解析 DBML'
    return [{ message, line: 1, column: 1, endLine: 1, endColumn: 2 }]
  }
  return diags.map((diag) => {
    const item = diag as {
      message?: string
      location?: { start?: { line?: number; column?: number }; end?: { line?: number; column?: number } }
    }
    const line = item.location?.start?.line ?? 1
    const column = item.location?.start?.column ?? 1
    const endLine = item.location?.end?.line ?? line
    const endColumn = Math.max((item.location?.end?.column ?? column) + 1, column + 1)
    return {
      message: item.message || '无法解析 DBML',
      line,
      column,
      endLine,
      endColumn,
    }
  })
}
