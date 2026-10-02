export interface Point {
  x: number
  y: number
}

export interface FieldView {
  name: string
  typeName: string
  pk: boolean
  unique: boolean
  notNull: boolean
  increment: boolean
  defaultValue: string
  note: string
  line: number
}

export interface IndexView {
  label: string
  pk: boolean
}

export interface TableView {
  id: string
  name: string
  schemaName: string
  label: string
  headerColor: string
  note: string
  line: number
  fields: FieldView[]
  indexes: IndexView[]
}

export interface EnumValueView {
  name: string
  note: string
}

export interface EnumView {
  id: string
  name: string
  schemaName: string
  label: string
  line: number
  values: EnumValueView[]
}

export interface Cardinality {
  many: boolean
  optional: boolean
}

export interface RefEnd {
  tableId: string
  fields: string[]
}

export interface SourceSpan {
  line: number
  column: number
  endLine: number
  endColumn: number
}

export interface RefView {
  id: string
  name: string
  color: string
  line: number
  span: SourceSpan
  inferred: boolean
  from: RefEnd
  to: RefEnd
  fromCard: Cardinality
  toCard: Cardinality
  onDelete: string
  onUpdate: string
}

export interface EnumLink {
  id: string
  tableId: string
  field: string
  enumId: string
}

export interface SchemaModel {
  tables: TableView[]
  enums: EnumView[]
  refs: RefView[]
  enumLinks: EnumLink[]
  omitted: string[]
}

export interface ParseIssue {
  message: string
  line: number
  column: number
  endLine: number
  endColumn: number
}

export interface ParseOk {
  ok: true
  model: SchemaModel
}

export interface ParseFail {
  ok: false
  issues: ParseIssue[]
}

export type ParseResult = ParseOk | ParseFail

export const HEADER_PALETTE = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#db2777',
]
