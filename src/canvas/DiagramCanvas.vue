<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import CardinalityMenu from './CardinalityMenu.vue'
import EnumCard from './EnumCard.vue'
import Outline from './Outline.vue'
import RelationLayer from './RelationLayer.vue'
import TableCard from './TableCard.vue'
import { nudgeCorner, nudgeSegment, removeCorner, type BendHandle, type Box } from '../model/route'
import type { Point } from '../model/types'
import { addRef, isRefVisible, jumpTo, moveNode, rememberLayout, selectNode, selectRef, setRoute, workspace, type RefOp } from '../workspace'

const viewport = ref<HTMLElement | null>(null)
const world = ref<HTMLElement | null>(null)
const sizes = reactive<Record<string, { w: number; h: number }>>({})
const fieldY = reactive<Record<string, number>>({})
const drop = reactive({ tableId: '', field: '' })
const draft = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
const pendingLink = ref<{ fromTable: string; fromField: string; toTable: string; toField: string; x: number; y: number } | null>(null)

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

const drawnRefs = computed(() => workspace.model.refs.filter(isRefVisible))

const fkByTable = computed(() => {
  const map = new Map<string, string[]>()
  const add = (tableId: string, field: string) => {
    const list = map.get(tableId) ?? []
    if (!list.includes(field)) list.push(field)
    map.set(tableId, list)
  }
  for (const ref of drawnRefs.value) {
    for (const field of ref.from.fields) add(ref.from.tableId, field)
    for (const field of ref.to.fields) add(ref.to.tableId, field)
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
  centerOn(request.id, request.zoom)
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
  if (pendingLink.value) pendingLink.value = null
  const target = event.target as HTMLElement
  if (target.closest('[data-drag-handle], [data-link-handle], [data-node-id], .hit, .bend, .outline, .menu')) return
  selectNode(null)
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
  selectNode(id)
  const origin = workspace.positions[id] ?? { x: 0, y: 0 }
  const startX = event.clientX
  const startY = event.clientY
  let armed = false
  const move = (ev: PointerEvent) => {
    if (!armed && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
    if (!armed) {
      rememberLayout()
      armed = true
    }
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
  selectRef(payload.refId)
  const origin = clientToWorld(payload.event.clientX, payload.event.clientY)
  const snapshot = payload.points.map((point) => ({ ...point }))
  let armed = false
  const move = (ev: PointerEvent) => {
    const point = clientToWorld(ev.clientX, ev.clientY)
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    if (Math.hypot(dx, dy) < 1) return
    if (!armed) {
      rememberLayout()
      armed = true
    }
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
  rememberLayout()
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
    const nextTable = card?.dataset.nodeId || ''
    const nextField = hit?.dataset.field || ''
    const sameField = nextTable === tableId && nextField === field
    drop.tableId = nextTable && !sameField ? nextTable : ''
    drop.field = drop.tableId ? nextField : ''
  }
  const up = (ev: PointerEvent) => {
    if (drop.tableId && drop.field) {
      pendingLink.value = {
        fromTable: tableId,
        fromField: field,
        toTable: drop.tableId,
        toField: drop.field,
        x: Math.min(ev.clientX, window.innerWidth - 210),
        y: Math.min(ev.clientY, window.innerHeight - 180),
      }
    }
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

function centerOn(id: string, zoomIn = false): void {
  const rect = viewport.value?.getBoundingClientRect()
  const box = boxes.value[id]
  if (!rect || !box) return
  if (zoomIn) workspace.zoom = clamp(Math.max(workspace.zoom, 1), 0.25, 2)
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
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) {
    workspace.zoom = clamp(workspace.zoom * factor, 0.25, 2)
    return
  }
  const mx = rect.width / 2
  const my = rect.height / 2
  const worldX = (mx - workspace.pan.x) / workspace.zoom
  const worldY = (my - workspace.pan.y) / workspace.zoom
  const next = clamp(workspace.zoom * factor, 0.25, 2)
  workspace.zoom = next
  workspace.pan.x = mx - worldX * next
  workspace.pan.y = my - worldY * next
}

function chooseLink(op: RefOp, fromOptional: boolean, toOptional: boolean): void {
  const link = pendingLink.value
  pendingLink.value = null
  if (!link) return
  addRef(link.fromTable, link.fromField, link.toTable, link.toField, op, fromOptional, toOptional)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

defineExpose({ fit, zoomBy })
</script>

<template>
  <div ref="viewport" class="viewport" :style="dotStyle" @wheel.prevent="onWheel" @pointerdown="onPointerDown">
    <Outline v-if="workspace.outlineOpen" />
    <div ref="world" class="world" :style="worldStyle">
      <RelationLayer
        :refs="drawnRefs"
        :links="workspace.model.enumLinks"
        :boxes="boxes"
        :field-y="fieldY"
        :selected-id="workspace.selectedRefId"
        :routes="workspace.routes"
        :draft="draft"
        @select="selectRef"
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
        @select="selectNode(table.id)"
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
        @select="selectNode(item.id)"
        @move-start="onMoveStart(item.id, $event)"
        @jump="jumpTo"
      />
    </div>
    <p v-if="workspace.model.tables.length === 0 && workspace.issues.length === 0" class="empty">
      在左侧写下 Table，关系图会出现在这里
    </p>
    <CardinalityMenu
      v-if="pendingLink"
      :x="pendingLink.x"
      :y="pendingLink.y"
      :same-table="pendingLink.fromTable === pendingLink.toTable"
      @choose="chooseLink"
      @cancel="pendingLink = null"
    />
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
