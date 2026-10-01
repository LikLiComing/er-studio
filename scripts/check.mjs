import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const parseMod = await server.ssrLoadModule('/src/model/parse.ts')
const layoutMod = await server.ssrLoadModule('/src/model/layout-comment.ts')
const optionalMod = await server.ssrLoadModule('/src/model/optional.ts')
const sampleMod = await server.ssrLoadModule('/src/model/sample.ts')

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

const round = layoutMod.appendLayout('Table users {\n  id int\n}', { users: { x: 80.2, y: 40 } })
const extracted = layoutMod.extractLayout(round)
check('layout roundtrip', extracted.positions.users.x === 80 && extracted.dbml.includes('Table users'))

const neutralized = optionalMod.neutralizeOptional("Ref: a.b >? c.d\nNote: 'keep ? intact'")
check('question in string kept', neutralized.text.includes("'keep ? intact'"))
check('operator question removed', !neutralized.text.includes('>?') && neutralized.marks.length === 1)

console.log(failures.length ? `FAILED\n${failures.join('\n')}` : 'OK')
await server.close()
if (failures.length) process.exit(1)
