<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RefView } from '../model/types'
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
</script>

<template>
  <svg class="edges">
    <g transform="translate(4000 4000)">
      <g
        v-for="edge in drawn"
        :key="edge.ref.id"
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
        <path class="line" :class="{ selected: selectedId === edge.ref.id }" :d="edge.d" />
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
        <text v-if="edge.ref.name && (selectedId === edge.ref.id || hoverId === edge.ref.id)" class="label" :x="edge.labelX" :y="edge.labelY - 8">
          {{ edge.ref.name }}
        </text>
        <g v-if="selectedId === edge.ref.id || hoverId === edge.ref.id" class="bends">
          <circle
            v-for="handle in edge.handles"
            :key="`${handle.kind}-${handle.index}`"
            class="bend"
            :class="handle.axis"
            :cx="handle.x"
            :cy="handle.y"
            r="6"
            @pointerdown.stop="emit('bend', { key: edge.key, refId: edge.ref.id, handle, points: edge.points, event: $event })"
            @dblclick.stop="handle.kind === 'corner' && emit('clearBend', { key: edge.key, points: edge.points, index: handle.index })"
          >
            <title>{{ handle.axis === 'y' ? '上下调整' : handle.axis === 'x' ? '左右调整' : '上下左右调整' }}</title>
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
