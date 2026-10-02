interface DbmlParser {
  parse(source: string, format: 'dbmlv2'): unknown
}

let parser: DbmlParser | null = null
let loading: Promise<DbmlParser> | null = null

export function parserReady(): boolean {
  return parser !== null
}

export function ensureParser(): Promise<DbmlParser> {
  if (parser) return Promise.resolve(parser)
  if (!loading) {
    loading = import('@dbml/core').then(({ Parser: ParserCtor }) => {
      parser = new ParserCtor() as DbmlParser
      return parser
    })
  }
  return loading
}

export function getParser(): DbmlParser {
  if (!parser) throw new Error('DBML 解析器尚未加载')
  return parser
}
