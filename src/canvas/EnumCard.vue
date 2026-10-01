<script setup lang="ts">
import type { EnumView } from '../model/types'

defineProps<{
  item: EnumView
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  moveStart: [event: PointerEvent]
  jump: [line: number]
}>()

function onHeaderDown(event: PointerEvent): void {
  if (event.button !== 0) return
  emit('select')
  emit('moveStart', event)
}
</script>

<template>
  <article class="card" :class="{ selected }" :data-node-id="item.id" @pointerdown="emit('select')">
    <header data-drag-handle @pointerdown.stop="onHeaderDown" @dblclick.stop="emit('jump', item.line)">
      <em>enum</em>
      <strong :title="item.label">{{ item.label }}</strong>
    </header>
    <div v-for="value in item.values" :key="value.name" class="value" :title="value.note || undefined">
      {{ value.name }}
    </div>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  min-width: 160px;
  background: #fff;
  border: 1px solid rgba(28, 25, 23, 0.08);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.05);
  overflow: hidden;
  user-select: none;
}
.card.selected { box-shadow: 0 0 0 2px #44403c; }
header {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: #44403c;
  color: #fff;
  cursor: grab;
}
em {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}
.value {
  height: 26px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-top: 1px solid #f2f4f5;
  font-size: 12.5px;
}
</style>
