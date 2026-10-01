import type { Cardinality, Point, RefView } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Side = 'left' | 'right'

export interface Anchor {
  x: number
  y: number
  side: Side
}

export interface Glyph {
  paths: string[]
  circles: { cx: number; r: number }[]
  extent: number
}

export function glyphFor(card: Cardinality): Glyph {
  if (card.many && card.optional) {
    return {
      paths: ['M 0 -5.5 L 10 0 L 0 5.5', 'M 0 0 L 10 0'],
      circles: [{ cx: 15.5, r: 3.2 }],
      extent: 20,
    }
  }
  if (card.many) {
    return {
      paths: ['M 0 -5.5 L 10 0 L 0 5.5', 'M 0 0 L 10 0', 'M 13 -6 V 6'],
      circles: [],
      extent: 16,
    }
  }
  if (card.optional) {
    return {
      paths: ['M 12 -6 V 6'],
      circles: [{ cx: 5, r: 3.2 }],
      extent: 15,
    }
  }
  return {
    paths: ['M 1 -6 V 6'],
    circles: [],
    extent: 4,
  }
}

export function chooseSides(a: Box, b: Box, sameTable: boolean): { a: Side; b: Side } {
  if (sameTable) return { a: 'right', b: 'right' }
  const aCenter = a.x + a.w / 2
  const bCenter = b.x + b.w / 2
  return aCenter <= bCenter ? { a: 'right', b: 'left' } : { a: 'left', b: 'right' }
}

export function anchorAt(box: Box, fieldY: number, side: Side, extent: number): Anchor {
  const edge = side === 'right' ? box.x + box.w : box.x
  const outward = side === 'right' ? 1 : -1
  return { x: edge + outward * extent, y: box.y + fieldY, side }
}

export function glyphOrigin(box: Box, side: Side): number {
  return side === 'right' ? box.x + box.w : box.x
}

export function routeKey(ref: Pick<RefView, 'from' | 'to' | 'name'>): string {
  const from = `${ref.from.tableId}.${ref.from.fields.join('+')}`
  const to = `${ref.to.tableId}.${ref.to.fields.join('+')}`
  return ref.name ? `${from}->${to}#${ref.name}` : `${from}->${to}`
}

export function routePath(a: Anchor, b: Anchor, lane: number, obstacles: Box[] = []): string {
  return pointsToPath(autoPoints(a, b, lane, obstacles))
}

export function autoPoints(a: Anchor, b: Anchor, lane: number, obstacles: Box[] = []): Point[] {
  const stub = 26 + lane * 10
  const dir = (side: Side) => (side === 'right' ? 1 : -1)
  const x1 = a.x + dir(a.side) * stub
  const x2 = b.x + dir(b.side) * stub
  const start = { x: a.x, y: a.y }
  const end = { x: b.x, y: b.y }
  const facing =
    (a.side === 'right' && b.side === 'left' && x1 <= x2) ||
    (a.side === 'left' && b.side === 'right' && x2 <= x1)

  if (facing) {
    const mid = (x1 + x2) / 2
    if (!crossesVertical(mid, a.y, b.y, obstacles)) {
      return simplify([{ ...start }, { x: mid, y: a.y }, { x: mid, y: b.y }, { ...end }])
    }
  }
  if (a.side === b.side) {
    const laneX = a.side === 'right' ? Math.max(x1, x2) + 28 : Math.min(x1, x2) - 28
    if (!crossesVertical(laneX, a.y, b.y, obstacles)) {
      return simplify([{ ...start }, { x: laneX, y: a.y }, { x: laneX, y: b.y }, { ...end }])
    }
  }

  const spanMin = Math.min(a.x, b.x)
  const spanMax = Math.max(a.x, b.x)
  const blocking = obstacles.filter((box) => box.x + box.w > spanMin && box.x < spanMax)
  const below = (blocking.length ? Math.max(...blocking.map((box) => box.y + box.h)) : Math.max(a.y, b.y)) + 32 + lane * 8
  const above = (blocking.length ? Math.min(...blocking.map((box) => box.y)) : Math.min(a.y, b.y)) - 32 - lane * 8
  const belowCost = Math.abs(below - a.y) + Math.abs(below - b.y)
  const aboveCost = Math.abs(above - a.y) + Math.abs(above - b.y)
  const laneY = belowCost <= aboveCost ? below : above
  return simplify([
    { ...start },
    { x: x1, y: a.y },
    { x: x1, y: laneY },
    { x: x2, y: laneY },
    { x: x2, y: b.y },
    { ...end },
  ])
}

export function pointsToPath(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(point.x)} ${Math.round(point.y)}`)
    .join(' ')
}

export function resolveRoute(start: Point, end: Point, custom: Point[] | undefined, auto: Point[]): Point[] {
  if (!custom) return auto
  return simplify(forceOrthogonal([start, ...custom, end]))
}

export interface BendHandle {
  kind: 'segment' | 'corner'
  index: number
  x: number
  y: number
  axis: 'x' | 'y' | 'both'
}

export function bendHandles(points: Point[]): BendHandle[] {
  const handles: BendHandle[] = []
  for (let index = 1; index < points.length - 1; index += 1) {
    handles.push({
      kind: 'corner',
      index,
      x: points[index].x,
      y: points[index].y,
      axis: 'both',
    })
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length < 28) continue
    const horizontal = Math.abs(from.y - to.y) <= Math.abs(from.x - to.x)
    handles.push({
      kind: 'segment',
      index,
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      axis: horizontal ? 'y' : 'x',
    })
  }
  return handles
}

export function nudgeSegment(points: Point[], index: number, dx: number, dy: number): Point[] {
  if (index < 0 || index >= points.length - 1) return interiorOf(points)
  const horizontal = isHorizontal(points[index], points[index + 1])
  const delta = horizontal ? dy : dx
  if (Math.abs(delta) < 0.4) return interiorOf(points)
  const moved = horizontal ? jogHorizontal(points, index, dy) : jogVertical(points, index, dx)
  return interiorOf(simplify(moved))
}

export function nudgeCorner(points: Point[], index: number, dx: number, dy: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return interiorOf(points)
  const pts = points.map((point) => ({ ...point }))
  const prev = pts[index - 1]
  const current = pts[index]
  const next = pts[index + 1]
  const prevHorizontal = isHorizontal(prev, current)
  const nextHorizontal = isHorizontal(current, next)
  current.x += dx
  current.y += dy
  if (index - 1 > 0) {
    if (prevHorizontal) prev.y = current.y
    else prev.x = current.x
  }
  if (index + 1 < pts.length - 1) {
    if (nextHorizontal) next.y = current.y
    else next.x = current.x
  }
  return interiorOf(simplify(forceOrthogonal(pts)))
}

export function removeCorner(points: Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return interiorOf(points)
  const next = points.filter((_, pointIndex) => pointIndex !== index)
  return interiorOf(simplify(forceOrthogonal(next)))
}

function jogHorizontal(points: Point[], index: number, dy: number): Point[] {
  const source = points.map((point) => ({ ...point }))
  const from = source[index]
  const to = source[index + 1]
  const first = index === 0
  const last = index + 1 === source.length - 1
  const y = from.y + dy
  const span = to.x - from.x
  const sign = Math.sign(span) || 1
  const stub = Math.min(28, Math.max(12, Math.abs(span) / 3))
  if (!first) source[index] = { ...from, y }
  if (!last) source[index + 1] = { ...source[index + 1], y }
  const elbows: Point[] = []
  if (first) elbows.push({ x: from.x + sign * stub, y: from.y }, { x: from.x + sign * stub, y })
  if (last) elbows.push({ x: to.x - sign * stub, y }, { x: to.x - sign * stub, y: to.y })
  if (elbows.length === 0) return source
  const at = first ? 1 : source.length - 1
  source.splice(at, 0, ...elbows)
  return source
}

function jogVertical(points: Point[], index: number, dx: number): Point[] {
  const source = points.map((point) => ({ ...point }))
  const from = source[index]
  const to = source[index + 1]
  const first = index === 0
  const last = index + 1 === source.length - 1
  const x = from.x + dx
  const span = to.y - from.y
  const sign = Math.sign(span) || 1
  const stub = Math.min(28, Math.max(12, Math.abs(span) / 3))
  if (!first) source[index] = { ...from, x }
  if (!last) source[index + 1] = { ...source[index + 1], x }
  const elbows: Point[] = []
  if (first) elbows.push({ x: from.x, y: from.y + sign * stub }, { x, y: from.y + sign * stub })
  if (last) elbows.push({ x, y: to.y - sign * stub }, { x: to.x, y: to.y - sign * stub })
  if (elbows.length === 0) return source
  const at = first ? 1 : source.length - 1
  source.splice(at, 0, ...elbows)
  return source
}

function forceOrthogonal(points: Point[]): Point[] {
  if (points.length === 0) return []
  const out: Point[] = [{ ...points[0] }]
  for (let index = 1; index < points.length; index += 1) {
    const last = out[out.length - 1]
    const point = points[index]
    if (Math.abs(last.x - point.x) < 0.8 && Math.abs(last.y - point.y) < 0.8) continue
    if (Math.abs(last.x - point.x) >= 0.8 && Math.abs(last.y - point.y) >= 0.8) {
      out.push({ x: point.x, y: last.y })
    }
    out.push({ ...point })
  }
  return out
}

function simplify(points: Point[]): Point[] {
  const unique: Point[] = []
  for (const point of points) {
    const last = unique[unique.length - 1]
    if (last && Math.abs(last.x - point.x) < 0.8 && Math.abs(last.y - point.y) < 0.8) continue
    unique.push({ ...point })
  }
  const out: Point[] = []
  for (const point of unique) {
    const count = out.length
    if (count >= 2) {
      const first = out[count - 2]
      const middle = out[count - 1]
      const sameX = Math.abs(first.x - middle.x) < 0.8 && Math.abs(middle.x - point.x) < 0.8
      const sameY = Math.abs(first.y - middle.y) < 0.8 && Math.abs(middle.y - point.y) < 0.8
      if (sameX || sameY) {
        out[count - 1] = { ...point }
        continue
      }
    }
    out.push({ ...point })
  }
  return out
}

function interiorOf(points: Point[]): Point[] {
  return points.slice(1, -1).map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  }))
}

function isHorizontal(from: Point, to: Point): boolean {
  return Math.abs(from.y - to.y) <= Math.abs(from.x - to.x)
}

function crossesVertical(x: number, y1: number, y2: number, obstacles: Box[]): boolean {
  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)
  return obstacles.some((box) => x > box.x + 6 && x < box.x + box.w - 6 && bottom > box.y + 4 && top < box.y + box.h - 4)
}
