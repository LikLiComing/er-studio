import type { SchemaModel } from './types'
import type { Box } from './route'
import {
  anchorAt,
  autoPoints,
  chooseSides,
  glyphFor,
  pointsToPath,
  resolveRoute,
  routeKey,
} from './route'
import type { RefView } from './types'
import type { Point } from './types'

const PADDING = 48

export interface DiagramExportInput {
  model: SchemaModel
  boxes: Record<string, Box>
  fieldY: Record<string, number>
  routes: Record<string, Point[]>
  refs: RefView[]
  cardHtml: Record<string, string>
}

export function buildDiagramSvg(input: DiagramExportInput): string {
  const bounds = computeBounds(input.boxes)
  const width = bounds.maxX - bounds.minX + PADDING * 2
  const height = bounds.maxY - bounds.minY + PADDING * 2
  const offsetX = PADDING - bounds.minX
  const offsetY = PADDING - bounds.minY

  const relationPaths = renderRelations(input, offsetX, offsetY)
  const cards = Object.entries(input.boxes).map(([id, box]) => {
    const html = input.cardHtml[id] ?? ''
    const x = box.x + offsetX
    const y = box.y + offsetY
    return `<foreignObject x="${x}" y="${y}" width="${box.w}" height="${box.h}">${html}</foreignObject>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g>${relationPaths.join('')}</g>
  <g>${cards.join('')}</g>
</svg>`
}

export async function svgToPng(svg: string): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) reject(new Error('PNG 导出失败'))
        else resolve(result)
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法渲染 SVG'))
    image.src = url
  })
}

function computeBounds(boxes: Record<string, Box>): { minX: number; minY: number; maxX: number; maxY: number } {
  const values = Object.values(boxes)
  if (values.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 }
  return {
    minX: Math.min(...values.map((box) => box.x)),
    minY: Math.min(...values.map((box) => box.y)),
    maxX: Math.max(...values.map((box) => box.x + box.w)),
    maxY: Math.max(...values.map((box) => box.y + box.h)),
  }
}

function renderRelations(input: DiagramExportInput, offsetX: number, offsetY: number): string[] {
  const lanes = new Map<string, number>()
  return input.refs.flatMap((ref) => {
    const fromBox = input.boxes[ref.from.tableId]
    const toBox = input.boxes[ref.to.tableId]
    if (!fromBox || !toBox) return []
    const same = ref.from.tableId === ref.to.tableId
    const sides = chooseSides(fromBox, toBox, same)
    const fromGlyph = glyphFor(ref.fromCard)
    const toGlyph = glyphFor(ref.toCard)
    const fromY = averageY(ref.from.tableId, ref.from.fields, fromBox.h / 2, input.fieldY)
    const toY = averageY(ref.to.tableId, ref.to.fields, toBox.h / 2, input.fieldY)
    const from = anchorAt(fromBox, fromY, sides.a, fromGlyph.extent)
    const to = anchorAt(toBox, toY, sides.b, toGlyph.extent)
    const laneKey = [ref.from.tableId, sides.a, ref.to.tableId, sides.b].join(':')
    const lane = lanes.get(laneKey) ?? 0
    lanes.set(laneKey, lane + 1)
    const obstacles = Object.entries(input.boxes)
      .filter(([id]) => id !== ref.from.tableId && id !== ref.to.tableId)
      .map(([, box]) => box)
    const key = routeKey(ref)
    const auto = autoPoints(from, to, lane, obstacles)
    const points = resolveRoute({ x: from.x, y: from.y }, { x: to.x, y: to.y }, input.routes[key], auto)
      .map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }))
    const d = pointsToPath(points)
    return [`<path d="${d}" fill="none" stroke="${ref.color}" stroke-width="2"/>`]
  })
}

function averageY(tableId: string, fields: string[], fallback: number, fieldY: Record<string, number>): number {
  const values = fields.map((field) => fieldY[`${tableId}.${field}`]).filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return fallback
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename)
}
