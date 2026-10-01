import type { Point } from './types'

const MARK = '// @er-studio-layout'

export function extractLayout(text: string): {
  dbml: string
  positions: Record<string, Point>
  routes: Record<string, Point[]>
} {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === MARK)
  if (start < 0) {
    return { dbml: text.replace(/\s+$/, ''), positions: {}, routes: {} }
  }

  const positions: Record<string, Point> = {}
  const routes: Record<string, Point[]> = {}
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('// @pos ')) {
      const parts = line.slice('// @pos '.length).trim().split(/\s+/)
      if (parts.length < 3) continue
      const y = Number(parts.pop())
      const x = Number(parts.pop())
      const id = parts.join(' ')
      if (!id || Number.isNaN(x) || Number.isNaN(y)) continue
      positions[id] = { x, y }
      continue
    }
    if (!line.startsWith('// @route ')) continue
    const parts = line.slice('// @route '.length).trim().split(/\s+/)
    const numbers: number[] = []
    while (parts.length > 0 && /^-?\d+(?:\.\d+)?$/.test(parts[parts.length - 1])) {
      numbers.unshift(Number(parts.pop()))
    }
    const id = parts.join(' ')
    if (!id || numbers.length < 2 || numbers.length % 2 !== 0) continue
    const points: Point[] = []
    for (let index = 0; index < numbers.length; index += 2) {
      points.push({ x: numbers[index], y: numbers[index + 1] })
    }
    routes[id] = points
  }

  return {
    dbml: lines.slice(0, start).join('\n').replace(/\s+$/, ''),
    positions,
    routes,
  }
}

export function appendLayout(
  dbml: string,
  positions: Record<string, Point>,
  routes: Record<string, Point[]> = {},
): string {
  const clean = extractLayout(dbml).dbml.replace(/\s+$/, '')
  const positionLines = Object.entries(positions)
    .map(([id, point]) => `// @pos ${id} ${Math.round(point.x)} ${Math.round(point.y)}`)
  const routeLines = Object.entries(routes)
    .filter(([, points]) => points.length > 0)
    .map(([id, points]) => `// @route ${id} ${points.map((point) => `${Math.round(point.x)} ${Math.round(point.y)}`).join(' ')}`)
  const body = [...positionLines, ...routeLines]
  if (body.length === 0) return `${clean}\n`
  return `${clean}\n\n${MARK}\n${body.join('\n')}\n`
}
