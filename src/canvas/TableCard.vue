<script setup lang="ts">
import type { FieldView, TableView } from '../model/types'

defineProps<{
  table: TableView
  selected: boolean
  fkFields: string[]
  dropField: string
}>()

const emit = defineEmits<{
  select: []
  moveStart: [event: PointerEvent]
  linkStart: [field: string, event: PointerEvent]
  jump: [line: number]
}>()

function onHeaderDown(event: PointerEvent): void {
  if (event.button !== 0) return
  emit('select')
  emit('moveStart', event)
}

function fieldTitle(field: FieldView): string {
  const parts = [
    field.notNull ? '非空' : '',
    field.unique ? '唯一' : '',
    field.increment ? '自增' : '',
    field.defaultValue ? `默认 ${field.defaultValue}` : '',
    field.note,
  ].filter(Boolean)
  return parts.join(' · ')
}

function shortDefault(value: string): string {
  const text = value.length > 12 ? `${value.slice(0, 11)}…` : value
  return `= ${text}`
}
</script>

<template>
  <article
    class="card"
    :class="{ selected }"
    :data-node-id="table.id"
    :style="{ '--header': table.headerColor }"
    @pointerdown="emit('select')"
  >
    <header
      data-drag-handle
      @pointerdown.stop="onHeaderDown"
      @dblclick.stop="emit('jump', table.line)"
    >
      <strong :title="table.label">{{ table.label }}</strong>
      <span v-if="table.note" class="note" :title="table.note">注</span>
    </header>
    <div
      v-for="field in table.fields"
      :key="field.name"
      class="field"
      :class="{ drop: dropField === field.name, pk: field.pk }"
      :data-field="field.name"
      @dblclick.stop="emit('jump', field.line)"
    >
      <svg v-if="field.pk" class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5.2" cy="8" r="2.1" fill="none" stroke="#e8b931" stroke-width="1.6" />
        <path d="M7.2 8H14M11.6 8v2.1" fill="none" stroke="#e8b931" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <svg v-else-if="fkFields.includes(field.name)" class="icon link" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.4 9.6 4.8 11.2a2.2 2.2 0 0 1-3.1-3.1L3.3 6.5a2.2 2.2 0 0 1 3.1 0l.7.7-1 1-.7-.7a.8.8 0 0 0-1.1 1.1l1.6 1.6a.8.8 0 0 0 1.1-1.1l-.6-.6 1-1 .6.6a2.2 2.2 0 0 1 0 3.1 2.2 2.2 0 0 1-3.1 0l.5-.5zm3.2-3.2 1.6-1.6a2.2 2.2 0 0 1 3.1 3.1L12.7 9.5a2.2 2.2 0 0 1-3.1 0l-.7-.7 1-1 .7.7a.8.8 0 0 0 1.1-1.1L10.1 6a.8.8 0 0 0-1.1 1.1l.6.6-1 1-.6-.6a2.2 2.2 0 0 1 0-3.1 2.2 2.2 0 0 1 3.1 0l-.5.5z" />
      </svg>
      <span v-else class="icon spacer" />
      <span class="name" :class="{ required: field.notNull }" :title="fieldTitle(field) || undefined">{{ field.name }}</span>
      <span v-if="field.notNull" class="mark" title="非空">*</span>
      <span v-if="field.unique" class="badge" title="唯一">UQ</span>
      <span v-if="field.increment" class="badge inc" title="自增">++</span>
      <span v-if="field.note" class="note-mark" :title="field.note">注</span>
      <span class="type" :title="field.defaultValue ? `默认 ${field.defaultValue}` : undefined">{{ field.typeName }}</span>
      <span v-if="field.defaultValue" class="def" :title="`默认 ${field.defaultValue}`">{{ shortDefault(field.defaultValue) }}</span>
      <i
        class="handle"
        data-link-handle
        title="拖到字段上建立关系，松手后选择基数"
        @pointerdown.stop.prevent="emit('linkStart', field.name, $event)"
      />
    </div>
    <footer v-if="table.indexes.length">
      <p v-for="(index, i) in table.indexes" :key="i">
        <svg v-if="index.pk" class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="5.2" cy="8" r="2.1" fill="none" stroke="#e8b931" stroke-width="1.6" />
          <path d="M7.2 8H14M11.6 8v2.1" fill="none" stroke="#e8b931" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        {{ index.label }}
      </p>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  min-width: 220px;
  max-width: 340px;
  background: #fff;
  border: 1px solid rgba(28, 25, 23, 0.08);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.05), 0 10px 24px rgba(28, 25, 23, 0.06);
  overflow: hidden;
  user-select: none;
}
.card.selected {
  box-shadow: 0 0 0 2px var(--header), 0 10px 24px rgba(28, 25, 23, 0.08);
}
header {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--header);
  color: #fff;
  cursor: grab;
}
header:active { cursor: grabbing; }
strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.note {
  margin-left: auto;
  width: 16px;
  height: 16px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
.field {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 0 8px;
  border-top: 1px solid #f2f4f5;
  font-size: 12.5px;
  color: #1c1917;
}
.field.drop { background: #ecfdf5; }
.icon { width: 13px; height: 13px; flex: none; }
.icon.key { fill: #e8b931; }
.icon.link { fill: #94a3b8; }
.spacer { display: block; }
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name.required { font-weight: 650; }
.mark {
  flex: none;
  color: #b45309;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.badge {
  flex: none;
  color: #0f766e;
  font-size: 10px;
  font-weight: 700;
}
.badge.inc { color: #b45309; }
.note-mark {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 99px;
  background: #f5f5f4;
  color: #78716c;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}
.type {
  margin-left: auto;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #8a847c;
  font-size: 11.5px;
  white-space: nowrap;
}
.def {
  flex: none;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #a8a29e;
  font-size: 10.5px;
  font-style: normal;
  white-space: nowrap;
}
.handle {
  width: 12px;
  height: 12px;
  margin-left: 2px;
  border-radius: 99px;
  background: #a8a29e;
  box-shadow: 0 0 0 2px #fff;
  flex: none;
  cursor: crosshair;
}
.field:hover .handle { background: var(--header); }
footer {
  border-top: 1px dashed #e7e5e4;
  padding: 5px 10px 6px;
  color: #8a847c;
  font-size: 11px;
}
footer p { margin: 0; line-height: 1.45; }
</style>
