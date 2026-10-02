import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const parseMod = await server.ssrLoadModule('/src/model/parse.ts')
await parseMod.ensureParser()
const layoutMod = await server.ssrLoadModule('/src/model/layout-comment.ts')
const optionalMod = await server.ssrLoadModule('/src/model/optional.ts')
const sampleMod = await server.ssrLoadModule('/src/model/sample.ts')
const editMod = await server.ssrLoadModule('/src/model/text-edit.ts')

const failures = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const sample = parseMod.parseDbml(sampleMod.SAMPLE_DBML)
check('sample parses', sample.ok, sample.ok ? '' : JSON.stringify(sample.issues))
if (sample.ok) {
  check('4 tables', sample.model.tables.length === 4, String(sample.model.tables.length))
  check('1 enum', sample.model.enums.length === 1)
  check('3 refs', sample.model.refs.length === 3, String(sample.model.refs.length))
  const orders = sample.model.tables.find((table) => table.id === 'orders')
  check('orders index', orders?.indexes[0]?.label.includes('orders_user_created'))
  check('users color', sample.model.tables[0].headerColor === '#2563eb')
  check('email not null', sample.model.tables[0].fields[1].notNull)
  const userRef = sample.model.refs.find((ref) => ref.from.fields.includes('user_id') && ref.from.tableId === 'orders')
  check('orders ref from orders', Boolean(userRef))
  check('orders ref many to one', Boolean(userRef && userRef.fromCard.many && !userRef.toCard.many && !userRef.toCard.optional))
  check('sample refs are explicit', sample.model.refs.every((ref) => ref.inferred === false))
  check('enum link', sample.model.enumLinks.length === 1 && sample.model.enumLinks[0].enumId === 'product_status')
  check('default value', sample.model.tables[0].fields[3].defaultValue === 'now()')
  check('sample has no omitted groups', sample.model.omitted.length === 0, sample.model.omitted.join(','))
}

const optional = parseMod.parseDbml(`
Table users { id int [pk] }
Table posts {
  id int [pk]
  editor_id int [ref: >? users.id]
}
Ref named: posts.id - users.id
`)
check('optional parses', optional.ok, optional.ok ? '' : JSON.stringify(optional.issues))
if (optional.ok) {
  const ref = optional.model.refs.find((item) => item.from.fields.includes('editor_id') || item.to.fields.includes('editor_id'))
  check('optional mark on one side', Boolean(ref && ref.toCard.optional && !ref.fromCard.optional), JSON.stringify(ref))
}

const broken = parseMod.parseDbml('Table {')
check('syntax error', !broken.ok && broken.issues[0].line === 1)

const trailingComma = parseMod.parseDbml('Table users {\n  id int [pk]\n  phone varchar,\n}')
check('trailing comma field', trailingComma.ok && trailingComma.model.tables[0].fields.some((field) => field.name === 'phone'))

const stuckBracket = parseMod.parseDbml('Table users {\n  id int [pk]\n  phone varchar[not null]\n}')
check('space before settings', stuckBracket.ok && stuckBracket.model.tables[0].fields.find((field) => field.name === 'phone')?.notNull)

const missingType = parseMod.parseDbml('Table users {\n  id\n}')
check('missing type in Chinese', !missingType.ok && missingType.issues[0].message.includes('类型'))

const round = layoutMod.appendLayout('Table users {\n  id int\n}', { users: { x: 80.2, y: 40 } }, {}, ['orders.user_id->users.id'])
const extracted = layoutMod.extractLayout(round)
check('layout roundtrip', extracted.positions.users.x === 80 && extracted.dbml.includes('Table users'))
check('hidden inference roundtrip', extracted.hiddenInferences[0] === 'orders.user_id->users.id')

const inferred = parseMod.parseDbml(`
Table users { id int [pk] }
Table posts { user_id int }
`)
check('inferred ref', inferred.ok && inferred.model.refs.length === 1 && inferred.model.refs[0].inferred)

const grouped = parseMod.parseDbml(`
TableGroup g { users }
Project app { database_type: 'PostgreSQL' }
Table users { id int [pk] }
`)
check('omitted constructs', grouped.ok && grouped.model.omitted.includes('TableGroup') && grouped.model.omitted.includes('Project'), grouped.ok ? grouped.model.omitted.join(',') : '')

const qualified = parseMod.parseDbml(`
Table core.users { id int [pk] }
Table audit.users { id int [pk] }
`)
check('schema label', qualified.ok && qualified.model.tables.some((table) => table.label.includes('.')), qualified.ok ? qualified.model.tables.map((table) => table.label).join(',') : '')

const inserted = editMod.insertBlock('Table users {\n  id int\n}', 'Ref: posts.user_id > users.id')
check('insert selects ref line', editMod.applySpan('Table users {\n  id int\n}', inserted.span).split('\n')[inserted.selectLine - 1].startsWith('Ref:'))

function refRange(line) {
  const start = line.indexOf('ref:')
  return { line: 1, column: start + 1, endLine: 1, endColumn: start + 1 + 'ref: > users.id'.length }
}
const inline = '  user_id int [not null, ref: > users.id]'
const inlineNext = editMod.applySpan(`${inline}\n`, editMod.deleteRange(`${inline}\n`, refRange(inline)))
check('inline ref removed', inlineNext.includes('[not null]') && !inlineNext.includes('ref:'), JSON.stringify(inlineNext))

const onlyRef = '  user_id int [ref: > users.id]'
const onlyNext = editMod.applySpan(`${onlyRef}\n`, editMod.deleteRange(`${onlyRef}\n`, refRange(onlyRef)))
check('lone ref setting removed', onlyNext.trim() === 'user_id int', JSON.stringify(onlyNext))

const neutralized = optionalMod.neutralizeOptional("Ref: a.b >? c.d\nNote: 'keep ? intact'")
check('question in string kept', neutralized.text.includes("'keep ? intact'"))
check('operator question removed', !neutralized.text.includes('>?') && neutralized.marks.length === 1)

const hyphenRef = parseMod.parseDbml(`
Table users { id int [pk] }
Table posts { author int }
Ref "fk-posts-users": posts.author >? users.id
`)
if (hyphenRef.ok) {
  const ref = hyphenRef.model.refs[0]
  check('hyphenated ref name keeps operator', Boolean(ref && ref.toCard.optional && ref.from.tableId === 'posts' && ref.to.tableId === 'users'))
} else {
  check('hyphenated ref name keeps operator', false, JSON.stringify(hyphenRef.issues))
}

const substringRef = parseMod.parseDbml(`
Table user { id int [pk] }
Table user_roles { uid int [pk] }
Ref: user.id <? user_roles.uid
`)
if (substringRef.ok) {
  const ref = substringRef.model.refs[0]
  check('ref endpoints avoid substring match', Boolean(ref && ref.from.tableId === 'user' && ref.to.tableId === 'user_roles' && ref.fromCard.optional))
} else {
  check('ref endpoints avoid substring match', false, JSON.stringify(substringRef.issues))
}

const aliasRef = parseMod.parseDbml(`
Table users as U { id int [pk] }
Table posts { uid int }
Ref: posts.uid > U.id
`)
check('table alias ref resolves', aliasRef.ok && aliasRef.model.refs.some((ref) => ref.to.tableId === 'users'), aliasRef.ok ? '' : JSON.stringify(aliasRef.issues))

const compositePk = parseMod.parseDbml(`
Table t {
  x int
  y int
  indexes {
    (x, y) [pk]
  }
}
`)
check('composite pk marks fields', compositePk.ok && compositePk.model.tables[0].fields.every((field) => field.pk))

const docMod = await server.ssrLoadModule('/src/model/document-io.ts')
const multi = docMod.serializeDocumentFile({
  activeSheetId: 'a',
  sheets: [
    { id: 'a', name: '甲', dbml: 'Table a { id int }', positions: {}, routes: {}, hiddenInferences: [] },
    { id: 'b', name: '乙', dbml: 'Table b { id int }', positions: {}, routes: {}, hiddenInferences: [] },
  ],
})
const parsedMulti = docMod.parseDocumentFile(multi)
check('multi sheet roundtrip', parsedMulti.sheets.length === 2 && parsedMulti.activeSheetId === 'a')

const enrichMod = await server.ssrLoadModule('/src/model/sql-export-enrich.ts')
const sampleDbml = `Enum s {
  on [note: '启用']
  off
}
Table t {
  id int [pk]
  flag s
}
`
const enriched = enrichMod.enrichDbmlForSqlExport(sampleDbml, {
  tables: [{
    id: 't',
    fields: [
      { name: 'id', line: 6, pk: true },
      { name: 'flag', line: 7, pk: false },
    ],
  }],
  enums: [{ id: 's', name: 's', values: [{ name: 'on', note: '启用' }, { name: 'off', note: '' }] }],
  enumLinks: [{ tableId: 't', field: 'flag', enumId: 's' }],
  refs: [],
  omitted: [],
})
check('sql enrich adds enum note', enriched.includes('枚举 s') && enriched.includes('启用'))
check('sql enrich header', enrichMod.buildEnumSqlHeader({
  tables: [],
  enums: [{ id: 's', name: 's', values: [{ name: 'on', note: '启用' }] }],
  enumLinks: [],
  refs: [],
  omitted: [],
}).includes('ER Studio'))

console.log(failures.length ? `FAILED\n${failures.join('\n')}` : 'OK')
await server.close()
if (failures.length) process.exit(1)
