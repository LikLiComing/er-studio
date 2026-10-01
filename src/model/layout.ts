import type { Point, SchemaModel, TableView } from './types'

const COL_PITCH = 320
const ROW_GAP = 48
const COMPONENT_GAP = 120

export function estimateHeight(table: TableView | undefined): number {
  if (!table) return 180
  const indexBlock = table.indexes.length ? 18 + table.indexes.length * 18 : 0
  return 36 + table.fields.length * 26 + indexBlock + 2
}

export function reconcilePositions(
  existing: Record<string, Point>,
  model: SchemaModel,
): Record<string, Point> {
  const positions: Record<string, Point> = {}
  for (const [id, point] of Object.entries(existing)) {
    positions[id] = { ...point }
  }

  const parents = new Map<string, string[]>()
  for (const ref of model.refs) {
    const fromMany = ref.fromCard.many && !ref.toCard.many
    const toMany = ref.toCard.many && !ref.fromCard.many
    if (fromMany) {
      const list = parents.get(ref.from.tableId) ?? []
      list.push(ref.to.tableId)
      parents.set(ref.from.tableId, list)
    } else if (toMany) {
      const list = parents.get(ref.to.tableId) ?? []
      list.push(ref.from.tableId)
      parents.set(ref.to.tableId, list)
    }
  }

  const column = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number => {
    const known = column.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    const incoming = parents.get(id) ?? []
    const value = incoming.length === 0 ? 0 : 1 + Math.max(...incoming.map(depth))
    visiting.delete(id)
    column.set(id, value)
    return value
  }
  for (const table of model.tables) depth(table.id)

  const byColumn = new Map<number, TableView[]>()
  for (const table of model.tables) {
    const col = column.get(table.id) ?? 0
    const list = byColumn.get(col) ?? []
    list.push(table)
    byColumn.set(col, list)
  }

  for (const [col, tables] of byColumn) {
    let y = 48
    for (const table of tables) {
      const placed = positions[table.id]
      if (placed) y = Math.max(y, placed.y + estimateHeight(table) + ROW_GAP)
    }
    for (const table of tables) {
      if (positions[table.id]) continue
      positions[table.id] = { x: 40 + col * COL_PITCH, y }
      y += estimateHeight(table) + ROW_GAP
    }
  }

  let enumY = 48
  for (const table of model.tables) {
    const placed = positions[table.id]
    if (placed && placed.x < COL_PITCH) enumY = Math.max(enumY, placed.y + estimateHeight(table) + ROW_GAP)
  }
  for (const item of model.enums) {
    if (positions[item.id]) continue
    positions[item.id] = { x: 40, y: enumY }
    enumY += 36 + item.values.length * 26 + ROW_GAP
  }

  return positions
}

/**
 * Build a fresh, relationship-aware layout for the whole diagram.
 *
 * Connected tables are kept in the same component. Each component is laid out
 * in graph layers, with a small barycentre pass to keep neighbouring edges in
 * the same order and reduce crossings. Existing manual positions are ignored
 * intentionally: this function is used by the one-click beautify action.
 */
export function beautifyPositions(model: SchemaModel): Record<string, Point> {
  const positions: Record<string, Point> = {}
  const tableById = new Map(model.tables.map((table) => [table.id, table]))
  const neighbours = new Map<string, Set<string>>()
  for (const table of model.tables) neighbours.set(table.id, new Set())
  for (const ref of model.refs) {
    if (!tableById.has(ref.from.tableId) || !tableById.has(ref.to.tableId)) continue
    neighbours.get(ref.from.tableId)?.add(ref.to.tableId)
    neighbours.get(ref.to.tableId)?.add(ref.from.tableId)
  }

  const components: string[][] = []
  const unseen = new Set(model.tables.map((table) => table.id))
  while (unseen.size > 0) {
    const seed = [...unseen].sort((a, b) => (neighbours.get(b)?.size ?? 0) - (neighbours.get(a)?.size ?? 0))[0]
    const queue = [seed]
    const component: string[] = []
    unseen.delete(seed)
    while (queue.length > 0) {
      const id = queue.shift() as string
      component.push(id)
      for (const next of neighbours.get(id) ?? []) {
        if (!unseen.has(next)) continue
        unseen.delete(next)
        queue.push(next)
      }
    }
    components.push(component)
  }

  let componentX = 48
  for (const component of components) {
    const componentLayout = layoutComponent(component, neighbours, tableById)
    let width = 0
    for (const [id, point] of Object.entries(componentLayout)) {
      positions[id] = { x: point.x + componentX, y: point.y + 48 }
      width = Math.max(width, point.x + estimateWidth(tableById.get(id)))
    }
    componentX += Math.max(320, width) + COMPONENT_GAP
  }

  // Enums are not part of the table graph. Keep them together beneath the
  // table components so they never become obstacles between related tables.
  let enumY = 48
  const maxTableY = Math.max(0, ...model.tables.map((table) => {
    const point = positions[table.id]
    return point ? point.y + estimateHeight(table) : 0
  }))
  enumY = maxTableY + 72
  for (const item of model.enums) {
    positions[item.id] = { x: 48, y: enumY }
    enumY += 36 + item.values.length * 26 + ROW_GAP
  }
  return positions
}

function layoutComponent(
  component: string[],
  neighbours: Map<string, Set<string>>,
  tableById: Map<string, TableView>,
): Record<string, Point> {
  const ids = new Set(component)
  const root = [...component].sort((a, b) => {
    const degree = (id: string) => neighbours.get(id)?.size ?? 0
    return degree(b) - degree(a) || a.localeCompare(b)
  })[0]
  const layers = new Map<string, number>([[root, 0]])
  const queue = [root]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const next of neighbours.get(id) ?? []) {
      if (!ids.has(next) || layers.has(next)) continue
      layers.set(next, (layers.get(id) ?? 0) + 1)
      queue.push(next)
    }
  }
  const maxLayer = Math.max(0, ...layers.values())
  const byLayer = new Map<number, string[]>()
  for (const id of component) {
    const layer = layers.get(id) ?? maxLayer + 1
    const list = byLayer.get(layer) ?? []
    list.push(id)
    byLayer.set(layer, list)
  }
  for (const list of byLayer.values()) list.sort((a, b) => a.localeCompare(b))

  // Order each layer around the barycentre of its already ordered neighbours.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let layer = 1; layer <= maxLayer; layer += 1) {
      const current = byLayer.get(layer) ?? []
      const previous = byLayer.get(layer - 1) ?? []
      const index = new Map(previous.map((id, i) => [id, i]))
      current.sort((a, b) => barycentre(a, index, neighbours) - barycentre(b, index, neighbours) || a.localeCompare(b))
    }
    for (let layer = maxLayer - 1; layer >= 0; layer -= 1) {
      const current = byLayer.get(layer) ?? []
      const next = byLayer.get(layer + 1) ?? []
      const index = new Map(next.map((id, i) => [id, i]))
      current.sort((a, b) => barycentre(a, index, neighbours) - barycentre(b, index, neighbours) || a.localeCompare(b))
    }
  }

  const result: Record<string, Point> = {}
  const columnWidths: number[] = []
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    const list = byLayer.get(layer) ?? []
    columnWidths[layer] = Math.max(260, ...list.map((id) => estimateWidth(tableById.get(id))))
  }
  for (let layer = 1; layer <= maxLayer; layer += 1) {
    columnWidths[layer] += 24
  }
  const xByLayer: number[] = []
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    xByLayer[layer] = layer === 0 ? 0 : xByLayer[layer - 1] + columnWidths[layer - 1] + 72
  }
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    let y = 0
    for (const id of byLayer.get(layer) ?? []) {
      result[id] = { x: xByLayer[layer], y }
      y += estimateHeight(tableById.get(id) as TableView) + ROW_GAP
    }
  }
  return result
}

function barycentre(id: string, index: Map<string, number>, neighbours: Map<string, Set<string>>): number {
  const values = [...(neighbours.get(id) ?? [])]
    .map((neighbour) => index.get(neighbour))
    .filter((value): value is number => value !== undefined)
  return values.length === 0 ? Number.MAX_SAFE_INTEGER : values.reduce((sum, value) => sum + value, 0) / values.length
}

function estimateWidth(table: TableView | undefined): number {
  if (!table) return 260
  const longest = Math.max(table.name.length, ...table.fields.map((field) => field.name.length + field.typeName.length + 4), 12)
  return Math.min(340, Math.max(220, longest * 8 + 48))
}
