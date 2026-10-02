import { buildEnumSqlHeader, enrichDbmlForSqlExport } from './sql-export-enrich'
import type { SchemaModel } from './types'

export type SqlDialect = 'postgres' | 'mysql'

export async function exportSql(dbml: string, dialect: SqlDialect, model?: SchemaModel): Promise<string> {
  const { exporter } = await import('@dbml/core')
  const source = model ? enrichDbmlForSqlExport(dbml, model) : dbml
  const header = model ? buildEnumSqlHeader(model) : ''
  return `${header}${exporter.export(source, dialect)}`
}

export async function importSql(sql: string, dialect: SqlDialect): Promise<string> {
  const { importer } = await import('@dbml/core')
  return importer.import(sql, dialect)
}
