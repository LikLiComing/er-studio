<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import EnumCard from './EnumCard.vue'
import RelationLayer from './RelationLayer.vue'
import TableCard from './TableCard.vue'
import { nudgeCorner, nudgeSegment, removeCorner, type BendHandle, type Box } from '../model/route'
import type { Point } from '../model/types'
import { addRef, jumpTo, moveNode, setRoute, workspace } from '../workspace'

const viewport = ref<HTMLElement | null>(null)
const world = ref<HTMLElement | null>(null)
const sizes = reactive<Record<string, { w: number; h: number }>>({})
const fieldY = reactive<Record<string, number>>({})
const drop = reactive({ tableId: '', field: '' })
const draft = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

const boxes = computed(() => {
  const next: Record<string, Box> = {}
  for (const table of workspace.model.tables) {
    const point = workspace.positions[table.id]
    const size = sizes[table.id]
    if (!point || !size) continue
    next[table.id] = { x: point.x, y: point.y, w: size.w, h: size.h }
  }
  for (const item of workspace.model.enums) {
    const point = workspace.positions[item.id]
    const size = sizes[item.id]
    if (!point || !size) continue
    next[item.id] = { x: point.x, y: point.y, w: size.w, h: size.h }
  }
  return next
})

const fkByTable = computed(() => {
  const map = new Map<string, string[]>()
  const add = (tableId: string, field: string) => {
    const list = map.get(tableId) ?? []
    if (!list.includes(field)) list.push(field)
    map.set(tableId, list)
  }
  for (const ref of workspace.model.refs) {
    if (ref.fromCard.many) add(ref.from.tableId, ref.from.fields[0])
    if (ref.toCard.many) add(ref.to.tableId, ref.to.fields[0])
  }
  return map
})

const worldStyle = computed(() => ({
  transform: `translate(${workspace.pan.x}px, ${workspace.pan.y}px) scale(${workspace.zoom})`,
}))

const dotStyle = computed(() => ({
  backgroundPosition: `${workspace.pan.x % 18}px ${workspace.pan.y % 18}px`,
}))

onMounted(async () => {
  await nextTick()
  measure()
  if (workspace.pendingFit) {
    fit(false)
    workspace.pendingFit = false
  }
})

watch(() => workspace.model, async () => {
  await nextTick()
  measure()
  if (workspace.pendingFit) {
    fit(false)
    workspace.pendingFit = false
  }
})

watch(() => workspace.focusRequest, (request) => {
  if (!request) return
  centerOn(request.id)
})

function measure(): void {
  if (!world.value) return
  for (const card of world.value.querySelectorAll<HTMLElement>('[data-node-id]')) {
    const id = card.dataset.nodeId
    if (!id) continue
    sizes[id] = { w: card.offsetWidth, h: card.offsetHeight }
    for (const row of card.querySelectorAll<HTMLElement>('[data-field]')) {
      const field = row.dataset.field
      if (!field) continue
      fieldY[`${id}.${field}`] = row.offsetTop + row.offsetHeight / 2
    }
  }
}

function onWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) {
    const rect = viewport.value?.getBoundingClientRect()
    if (!rect) return
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const worldX = (mx - workspace.pan.x) / workspace.zoom
    const worldY = (my - workspace.pan.y) / workspace.zoom
    const next = clamp(workspace.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.25, 2)
    workspace.zoom = next
    workspace.pan.x = mx - worldX * next
    workspace.pan.y = my - worldY * next
    return
  }
  if (event.shiftKey) workspace.pan.x -= event.deltaY
  else {
    workspace.pan.x -= event.deltaX
    workspace.pan.y -= event.deltaY
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('[data-drag-handle], [data-link-handle], [data-node-id], .hit, .bend')) return
  workspace.selectedId = null
  workspace.selectedRefId = null
  const startX = event.clientX
  const startY = event.clientY
  const originX = workspace.pan.x
  const originY = workspace.pan.y
  const move = (ev: PointerEvent) => {
    workspace.pan.x = originX + ev.clientX - startX
    workspace.pan.y = originY + ev.clientY - startY
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onMoveStart(id: string, event: PointerEvent): void {
  workspace.selectedId = id
  const origin = workspace.positions[id] ?? { x: 0, y: 0 }
  const startX = event.clientX
  const startY = event.clientY
  const move = (ev: PointerEvent) => {
    moveNode(id, origin.x + (ev.clientX - startX) / workspace.zoom, origin.y + (ev.clientY - startY) / workspace.zoom)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onBend(payload: { key: string; refId: string; handle: BendHandle; points: Point[]; event: PointerEvent }): void {
  workspace.selectedRefId = payload.refId
  const origin = clientToWorld(payload.event.clientX, payload.event.clientY)
  const snapshot = payload.points.map((point) => ({ ...point }))
  const move = (ev: PointerEvent) => {
    const point = clientToWorld(ev.clientX, ev.clientY)
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    if (Math.hypot(dx, dy) < 1) return
    const next = payload.handle.kind === 'segment'
      ? nudgeSegment(snapshot, payload.handle.index, dx, dy)
      : nudgeCorner(snapshot, payload.handle.index, dx, dy)
    setRoute(payload.key, next)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onClearBend(payload: { key: string; points: Point[]; index: number }): void {
  setRoute(payload.key, removeCorner(payload.points, payload.index))
}

function onLinkStart(tableId: string, field: string, event: PointerEvent): void {
  const box = boxes.value[tableId]
  const y = fieldY[`${tableId}.${field}`] ?? 20
  const start = box
    ? { x: box.x + box.w, y: box.y + y }
    : clientToWorld(event.clientX, event.clientY)
  draft.value = { x1: start.x, y1: start.y, x2: start.x, y2: start.y }
  const move = (ev: PointerEvent) => {
    const point = clientToWorld(ev.clientX, ev.clientY)
    if (draft.value) draft.value = { ...draft.value, x2: point.x, y2: point.y }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-field]')
    const card = hit?.closest<HTMLElement>('[data-node-id]')
    drop.tableId = card?.dataset.nodeId && card.dataset.nodeId !== tableId ? card.dataset.nodeId : ''
    drop.field = drop.tableId ? hit?.dataset.field || '' : ''
  }
  const up = () => {
    if (drop.tableId && drop.field) addRef(tableId, field, drop.tableId, drop.field)
    draft.value = null
    drop.tableId = ''
    drop.field = ''
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function fit(forceAll = true): void {
  const rect = viewport.value?.getBoundingClientRect()
  const values = Object.values(boxes.value)
  if (!rect || values.length === 0) return
  const minX = Math.min(...values.map((box) => box.x))
  const minY = Math.min(...values.map((box) => box.y))
  const maxX = Math.max(...values.map((box) => box.x + box.w))
  const maxY = Math.max(...values.map((box) => box.y + box.h))
  const padding = 48
  const fitted = Math.min(
    (rect.width - padding * 2) / Math.max(1, maxX - minX),
    (rect.height - padding * 2) / Math.max(1, maxY - minY),
    1.15,
  )
  if (!forceAll && fitted < 0.62) {
    workspace.zoom = 0.9
    workspace.pan.x = 28 - minX * 0.9
    workspace.pan.y = 24 - minY * 0.9
    return
  }
  const zoom = clamp(fitted, 0.25, 1.15)
  workspace.zoom = zoom
  workspace.pan.x = (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom
  workspace.pan.y = (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom
}

function centerOn(id: string): void {
  const rect = viewport.value?.getBoundingClientRect()
  const box = boxes.value[id]
  if (!rect || !box) return
  workspace.pan.x = rect.width / 2 - (box.x + box.w / 2) * workspace.zoom
  workspace.pan.y = rect.height / 2 - (box.y + box.h / 2) * workspace.zoom
}

function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (clientX - rect.left - workspace.pan.x) / workspace.zoom,
    y: (clientY - rect.top - workspace.pan.y) / workspace.zoom,
  }
}

function zoomBy(factor: number): void {
  workspace.zoom = clamp(workspace.zoom * factor, 0.25, 2)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

defineExpose({ fit, zoomBy })
</script>

<template>
  <div ref="viewport" class="viewport" :style="dotStyle" @wheel.prevent="onWheel" @pointerdown="onPointerDown">
    <div ref="world" class="world" :style="worldStyle">
      <RelationLayer
        :refs="workspace.model.refs"
        :boxes="boxes"
        :field-y="fieldY"
        :selected-id="workspace.selectedRefId"
        :routes="workspace.routes"
        :draft="draft"
        @select="workspace.selectedRefId = $event"
        @jump="jumpTo"
        @bend="onBend"
        @clear-bend="onClearBend"
      />
      <TableCard
        v-for="table in workspace.model.tables"
        :key="table.id"
        :table="table"
        :selected="workspace.selectedId === table.id"
        :fk-fields="fkByTable.get(table.id) ?? []"
        :drop-field="drop.tableId === table.id ? drop.field : ''"
        :style="{ left: `${workspace.positions[table.id]?.x ?? 0}px`, top: `${workspace.positions[table.id]?.y ?? 0}px` }"
        @select="workspace.selectedId = table.id"
        @move-start="onMoveStart(table.id, $event)"
        @link-start="(field, event) => onLinkStart(table.id, field, event)"
        @jump="jumpTo"
      />
      <EnumCard
        v-for="item in workspace.model.enums"
        :key="item.id"
        :item="item"
        :selected="workspace.selectedId === item.id"
        :style="{ left: `${workspace.positions[item.id]?.x ?? 0}px`, top: `${workspace.positions[item.id]?.y ?? 0}px` }"
        @select="workspace.selectedId = item.id"
        @move-start="onMoveStart(item.id, $event)"
        @jump="jumpTo"
      />
    </div>
    <p v-if="workspace.model.tables.length === 0 && workspace.issues.length === 0" class="empty">
      在左侧写下 Table，关系图会出现在这里
    </p>
    <div class="zoom">
      <button type="button" @click="zoomBy(1 / 1.12)">缩小</button>
      <span>{{ Math.round(workspace.zoom * 100) }}%</span>
      <button type="button" @click="zoomBy(1.12)">放大</button>
      <button type="button" @click="fit()">适应</button>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: #eef1f3;
  background-image: radial-gradient(#d5dbdf 1px, transparent 1px);
  background-size: 18px 18px;
  cursor: grab;
  touch-action: none;
}
.viewport:active { cursor: grabbing; }
.world {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}
.empty {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  margin: 0;
  color: #8a847c;
  font-size: 14px;
  pointer-events: none;
}
.zoom {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(28, 25, 23, 0.06);
}
.zoom button, .zoom span {
  border: 0;
  background: transparent;
  color: #44403c;
  font: inherit;
  font-size: 12px;
  min-width: 36px;
  height: 28px;
  border-radius: 6px;
}
.zoom button { cursor: pointer; }
.zoom button:hover { background: #f4f6f5; }
@media (max-width: 860px) {
  .zoom { display: none; }
}
</style>
