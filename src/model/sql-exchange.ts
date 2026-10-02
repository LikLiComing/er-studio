export type SqlDialect = 'postgres' | 'mysql'

export async function exportSql(dbml: string, dialect: SqlDialect): Promise<string> {
  const { exporter } = await import('@dbml/core')
  return exporter.export(dbml, dialect)
}

export async function importSql(sql: string, dialect: SqlDialect): Promise<string> {
  const { importer } = await import('@dbml/core')
  return importer.import(sql, dialect)
}
