<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EnumLink, RefView } from '../model/types'
import {
  anchorAt,
  autoPoints,
  bendHandles,
  chooseSides,
  glyphFor,
  glyphOrigin,
  pointsToPath,
  resolveRoute,
  routeKey,
  type BendHandle,
  type Box,
} from '../model/route'
import type { Point } from '../model/types'

const props = defineProps<{
  refs: RefView[]
  links: EnumLink[]
  boxes: Record<string, Box>
  fieldY: Record<string, number>
  selectedId: string | null
  routes: Record<string, Point[]>
  draft: { x1: number; y1: number; x2: number; y2: number } | null
}>()

const emit = defineEmits<{
  select: [id: string]
  jump: [line: number]
  bend: [payload: { key: string; refId: string; handle: BendHandle; points: Point[]; event: PointerEvent }]
  clearBend: [payload: { key: string; points: Point[]; index: number }]
}>()

const hoverId = ref('')

const drawn = computed(() => {
  const lanes = new Map<string, number>()
  return props.refs.flatMap((ref) => {
    const fromBox = props.boxes[ref.from.tableId]
    const toBox = props.boxes[ref.to.tableId]
    if (!fromBox || !toBox) return []
    const same = ref.from.tableId === ref.to.tableId
    const sides = chooseSides(fromBox, toBox, same)
    const fromGlyph = glyphFor(ref.fromCard)
    const toGlyph = glyphFor(ref.toCard)
    const fromY = averageY(ref.from.tableId, ref.from.fields, fromBox.h / 2)
    const toY = averageY(ref.to.tableId, ref.to.fields, toBox.h / 2)
    const from = anchorAt(fromBox, fromY, sides.a, fromGlyph.extent)
    const to = anchorAt(toBox, toY, sides.b, toGlyph.extent)
    const laneKey = [ref.from.tableId, sides.a, ref.to.tableId, sides.b].join(':')
    const lane = lanes.get(laneKey) ?? 0
    lanes.set(laneKey, lane + 1)
    const obstacles = Object.entries(props.boxes)
      .filter(([id]) => id !== ref.from.tableId && id !== ref.to.tableId)
      .map(([, box]) => box)
    const key = routeKey(ref)
    const auto = autoPoints(from, to, lane, obstacles)
    const points = resolveRoute({ x: from.x, y: from.y }, { x: to.x, y: to.y }, props.routes[key], auto)
    return [{
      ref,
      key,
      points,
      handles: bendHandles(points),
      d: pointsToPath(points),
      fromGlyph,
      toGlyph,
      fromOrigin: glyphOrigin(fromBox, sides.a),
      toOrigin: glyphOrigin(toBox, sides.b),
      fromY: fromBox.y + fromY,
      toY: toBox.y + toY,
      fromFlip: sides.a === 'left',
      toFlip: sides.b === 'left',
      labelX: labelPoint(points).x,
      labelY: labelPoint(points).y,
    }]
  })
})

const typeLinks = computed(() => {
  const lanes = new Map<string, number>()
  return props.links.flatMap((link) => {
    const fromBox = props.boxes[link.tableId]
    const toBox = props.boxes[link.enumId]
    if (!fromBox || !toBox) return []
    const fromY = props.fieldY[`${link.tableId}.${link.field}`] ?? fromBox.h / 2
    const sides = chooseSides(fromBox, toBox, false)
    const from = anchorAt(fromBox, fromY, sides.a, 8)
    const to = anchorAt(toBox, 18, sides.b, 8)
    const laneKey = `${link.tableId}:${link.enumId}`
    const lane = lanes.get(laneKey) ?? 0
    lanes.set(laneKey, lane + 1)
    const points = autoPoints(from, to, lane, [])
    return [{ id: link.id, enumId: link.enumId, d: pointsToPath(points) }]
  })
})

function labelPoint(points: Point[]): Point {
  let best = points[0] ?? { x: 0, y: 0 }
  let bestLength = -1
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length > bestLength) {
      bestLength = length
      best = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8 }
    }
  }
  return best
}

function averageY(tableId: string, fields: string[], fallback: number): number {
  const values = fields
    .map((field) => props.fieldY[`${tableId}.${field}`])
    .filter((value): value is number => value !== undefined)
  if (values.length === 0) return fallback
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function transform(x: number, y: number, flip: boolean): string {
  return flip ? `translate(${x} ${y}) scale(-1 1)` : `translate(${x} ${y})`
}

function edgeLabel(ref: RefView): string {
  if (ref.inferred) return ref.name ? `${ref.name} · 推断` : '推断'
  return ref.name
}
</script>

<template>
  <svg class="edges">
    <g transform="translate(4000 4000)">
      <g v-for="link in typeLinks" :key="link.id" class="type-link">
        <path class="type-line" :d="link.d" />
      </g>
      <g
        v-for="edge in drawn"
        :key="edge.ref.id"
        :class="{ inferred: edge.ref.inferred }"
        :style="{ color: edge.ref.color }"
        @pointerenter="hoverId = edge.ref.id"
        @pointerleave="hoverId = ''"
      >
        <path
          class="hit"
          :d="edge.d"
          @pointerdown.stop="emit('select', edge.ref.id)"
          @dblclick.stop="emit('jump', edge.ref.line)"
        />
        <path class="line" :class="{ selected: selectedId === edge.ref.id, inferred: edge.ref.inferred }" :d="edge.d" />
        <g :transform="transform(edge.fromOrigin, edge.fromY, edge.fromFlip)">
          <path v-for="(d, i) in edge.fromGlyph.paths" :key="`f${i}`" class="glyph" :d="d" />
          <circle
            v-for="(circle, i) in edge.fromGlyph.circles"
            :key="`fc${i}`"
            class="glyph"
            :cx="circle.cx"
            cy="0"
            :r="circle.r"
          />
        </g>
        <g :transform="transform(edge.toOrigin, edge.toY, edge.toFlip)">
          <path v-for="(d, i) in edge.toGlyph.paths" :key="`t${i}`" class="glyph" :d="d" />
          <circle
            v-for="(circle, i) in edge.toGlyph.circles"
            :key="`tc${i}`"
            class="glyph"
            :cx="circle.cx"
            cy="0"
            :r="circle.r"
          />
        </g>
        <text v-if="edgeLabel(edge.ref) && (selectedId === edge.ref.id || hoverId === edge.ref.id)" class="label" :x="edge.labelX" :y="edge.labelY - 8">
          {{ edgeLabel(edge.ref) }}
        </text>
        <g v-if="selectedId === edge.ref.id || hoverId === edge.ref.id" class="bends">
          <circle
            v-for="handle in edge.handles"
            :key="`${handle.kind}-${handle.index}`"
            class="bend"
            :class="handle.axis"
            :cx="handle.x"
            :cy="handle.y"
            r="8"
            @pointerdown.stop="emit('bend', { key: edge.key, refId: edge.ref.id, handle, points: edge.points, event: $event })"
            @dblclick.stop="handle.kind === 'corner' && emit('clearBend', { key: edge.key, points: edge.points, index: handle.index })"
          >
            <title>{{ handle.kind === 'corner' ? '拖动改走线，双击取消弯折' : handle.axis === 'y' ? '上下调整' : '左右调整' }}</title>
          </circle>
        </g>
      </g>
      <path v-if="draft" class="draft" :d="`M ${draft.x1} ${draft.y1} L ${draft.x2} ${draft.y2}`" />
    </g>
  </svg>
</template>

<style scoped>
.edges {
  position: absolute;
  left: -4000px;
  top: -4000px;
  width: 12000px;
  height: 8000px;
  overflow: visible;
  pointer-events: none;
}
.hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}
.line, .glyph, .draft {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
circle.glyph { fill: #fff; }
.line.selected { stroke-width: 2.6; }
.line.inferred { stroke-dasharray: 5 4; }
.type-link { pointer-events: none; }
.type-line {
  fill: none;
  stroke: #a8a29e;
  stroke-width: 1.2;
  stroke-dasharray: 2 4;
}
.glyph { fill: #fff; }
.draft {
  stroke: #0f766e;
  stroke-dasharray: 4 4;
}
.label {
  fill: #44403c;
  stroke: none;
  font-size: 11px;
  text-anchor: middle;
}
.bend {
  fill: #fff;
  stroke: currentColor;
  stroke-width: 1.8;
  pointer-events: all;
  cursor: move;
}
.bend.y { cursor: ns-resize; }
.bend.x { cursor: ew-resize; }
</style>
