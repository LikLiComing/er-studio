<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import FieldTypePicker from './FieldTypePicker.vue'
import { commonFieldTypes } from '../model/dbml-edit'
import type { FieldView, TableView } from '../model/types'

const props = defineProps<{
  table: TableView
  selected: boolean
  fkFields: string[]
  dropField: string
  showComments: boolean
  enumTypes: string[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  select: []
  moveStart: [event: PointerEvent]
  linkStart: [field: string, event: PointerEvent]
  renameTable: [name: string]
  setTableNote: [note: string]
  renameField: [field: string, name: string]
  setFieldType: [field: string, type: string]
  setFieldNote: [field: string, note: string]
  toggleFieldFlag: [field: string, flag: 'pk' | 'not null' | 'unique']
  deleteField: [field: string]
  addField: []
}>()

const editingHeader = ref(false)
const headerDraft = ref('')
const editingTableNote = ref(false)
const tableNoteDraft = ref('')
const editingField = ref('')
const fieldDraft = ref('')
const editingComment = ref('')
const commentDraft = ref('')
const menuField = ref('')
const menuPos = ref({ x: 0, y: 0 })
const typePicker = ref<{ field: string; x: number; y: number } | null>(null)

const typeOptions = computed(() => commonFieldTypes(props.enumTypes))

function startHeaderEdit(): void {
  if (props.readonly) return
  editingHeader.value = true
  headerDraft.value = props.table.name
  void nextTick(() => {
    document.querySelector<HTMLInputElement>(`[data-header-input="${props.table.id}"]`)?.focus()
  })
}

function commitHeader(): void {
  if (!editingHeader.value) return
  editingHeader.value = false
  emit('renameTable', headerDraft.value.trim())
}

function startTableNoteEdit(): void {
  if (props.readonly) return
  editingTableNote.value = true
  tableNoteDraft.value = props.table.note
}

function commitTableNote(): void {
  if (!editingTableNote.value) return
  editingTableNote.value = false
  emit('setTableNote', tableNoteDraft.value)
}

function startFieldEdit(field: FieldView): void {
  if (props.readonly) return
  editingField.value = field.name
  fieldDraft.value = field.name
}

function commitField(field: FieldView): void {
  if (editingField.value !== field.name) return
  editingField.value = ''
  emit('renameField', field.name, fieldDraft.value.trim())
}

function startCommentEdit(field: FieldView): void {
  if (props.readonly || !props.showComments) return
  editingComment.value = field.name
  commentDraft.value = field.note
}

function commitComment(field: FieldView): void {
  if (editingComment.value !== field.name) return
  editingComment.value = ''
  emit('setFieldNote', field.name, commentDraft.value)
}

function openMenu(field: FieldView, event: PointerEvent): void {
  if (props.readonly) return
  event.preventDefault()
  menuField.value = field.name
  menuPos.value = { x: event.clientX, y: event.clientY }
}

function openTypePicker(field: FieldView, event: PointerEvent): void {
  if (props.readonly) return
  event.stopPropagation()
  typePicker.value = { field: field.name, x: event.clientX, y: event.clientY - 8 }
}

function shortDefault(value: string): string {
  const text = value.length > 10 ? `${value.slice(0, 9)}…` : value
  return `= ${text}`
}
</script>

<template>
  <article
    class="card"
    :class="{ selected, wide: showComments }"
    :data-node-id="table.id"
    :style="{ '--header': table.headerColor }"
    @pointerdown="emit('select')"
  >
    <header data-drag-handle @pointerdown.stop="(event) => { emit('select'); emit('moveStart', event) }">
      <input
        v-if="editingHeader"
        :data-header-input="table.id"
        v-model="headerDraft"
        class="header-input"
        @pointerdown.stop
        @keydown.enter.prevent="commitHeader()"
        @keydown.esc.prevent="editingHeader = false"
        @blur="commitHeader()"
      />
      <strong v-else :title="table.label" @dblclick.stop="startHeaderEdit">{{ table.label }}</strong>
    </header>
    <p v-if="table.note || editingTableNote" class="subtitle" @dblclick.stop="startTableNoteEdit">
      <input
        v-if="editingTableNote"
        v-model="tableNoteDraft"
        class="subtitle-input"
        @pointerdown.stop
        @keydown.enter.prevent="commitTableNote()"
        @blur="commitTableNote()"
      />
      <span v-else>{{ table.note }}</span>
    </p>
    <p v-else-if="!readonly" class="subtitle placeholder" @dblclick.stop="startTableNoteEdit">双击添加表注释</p>

    <div
      v-for="field in table.fields"
      :key="field.name"
      class="field"
      :class="{ drop: dropField === field.name, pk: field.pk }"
      :data-field="field.name"
      @contextmenu.prevent="openMenu(field, $event)"
    >
      <button v-if="!readonly" type="button" class="del" title="删除字段" @click.stop="emit('deleteField', field.name)">×</button>
      <svg v-if="field.pk" class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5.2" cy="8" r="2.1" fill="none" stroke="#e8b931" stroke-width="1.6" />
        <path d="M7.2 8H14M11.6 8v2.1" fill="none" stroke="#e8b931" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <svg v-else-if="fkFields.includes(field.name)" class="icon link" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.4 9.6 4.8 11.2a2.2 2.2 0 0 1-3.1-3.1L3.3 6.5a2.2 2.2 0 0 1 3.1 0l.7.7-1 1-.7-.7a.8.8 0 0 0-1.1 1.1l1.6 1.6a.8.8 0 0 0 1.1-1.1l-.6-.6 1-1 .6.6a2.2 2.2 0 0 1 0 3.1 2.2 2.2 0 0 1-3.1 0l.5-.5zm3.2-3.2 1.6-1.6a2.2 2.2 0 0 1 3.1 3.1L12.7 9.5a2.2 2.2 0 0 1-3.1 0l-.7-.7 1-1 .7.7a.8.8 0 0 0 1.1-1.1L10.1 6a.8.8 0 0 0-1.1 1.1l.6.6-1 1-.6-.6a2.2 2.2 0 0 1 0-3.1 2.2 2.2 0 0 1 3.1 0l-.5.5z" />
      </svg>
      <span v-else class="icon spacer" />
      <input
        v-if="editingField === field.name"
        v-model="fieldDraft"
        class="name-input"
        @pointerdown.stop
        @keydown.enter.prevent="commitField(field)"
        @blur="commitField(field)"
      />
      <span v-else class="name" :class="{ required: field.notNull }" @dblclick.stop="startFieldEdit(field)">{{ field.name }}</span>
      <span v-if="field.notNull" class="mark" title="非空">*</span>
      <span v-if="field.unique" class="badge" title="唯一">UQ</span>
      <button type="button" class="type" :title="field.defaultValue ? `默认 ${field.defaultValue}` : '点击修改类型'" @click="openTypePicker(field, $event)">{{ field.typeName }}</button>
      <span v-if="field.defaultValue" class="def" :title="`默认 ${field.defaultValue}`">{{ shortDefault(field.defaultValue) }}</span>
      <input
        v-if="showComments && editingComment === field.name"
        v-model="commentDraft"
        class="comment-input"
        @pointerdown.stop
        @keydown.enter.prevent="commitComment(field)"
        @blur="commitComment(field)"
      />
      <span
        v-else-if="showComments"
        class="comment"
        :class="{ empty: !field.note }"
        :title="field.note || '添加注释'"
        @dblclick.stop="startCommentEdit(field)"
      >{{ field.note || '添加注释' }}</span>
      <i
        class="handle"
        data-link-handle
        title="拖到字段上建立关系，松手后选择基数"
        @pointerdown.stop.prevent="emit('linkStart', field.name, $event)"
      />
    </div>
    <button v-if="!readonly" type="button" class="add-field" @click.stop="emit('addField')">+ 添加字段</button>
    <footer v-if="table.indexes.length">
      <p v-for="(index, i) in table.indexes" :key="i">
        <svg v-if="index.pk" class="icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="5.2" cy="8" r="2.1" fill="none" stroke="#e8b931" stroke-width="1.6" />
          <path d="M7.2 8H14M11.6 8v2.1" fill="none" stroke="#e8b931" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        {{ index.label }}
      </p>
    </footer>
    <div
      v-if="menuField"
      class="menu"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
      @pointerdown.stop
    >
      <button type="button" @click="emit('toggleFieldFlag', menuField, 'pk'); menuField = ''">主键</button>
      <button type="button" @click="emit('toggleFieldFlag', menuField, 'not null'); menuField = ''">非空</button>
      <button type="button" @click="emit('toggleFieldFlag', menuField, 'unique'); menuField = ''">唯一</button>
    </div>
    <FieldTypePicker
      v-if="typePicker"
      :types="typeOptions"
      :value="table.fields.find((item) => item.name === typePicker?.field)?.typeName ?? ''"
      :x="typePicker.x"
      :y="typePicker.y"
      @pick="(value) => { if (typePicker) emit('setFieldType', typePicker.field, value); typePicker = null }"
      @close="typePicker = null"
    />
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
  overflow: visible;
  user-select: none;
}
.card.wide { max-width: 460px; min-width: 280px; }
.card.selected {
  box-shadow: 0 0 0 2px var(--header), 0 10px 24px rgba(28, 25, 23, 0.08);
}
header {
  min-height: 34px;
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
}
.header-input {
  width: 100%;
  border: 0;
  border-radius: 4px;
  height: 26px;
  padding: 0 6px;
  font: inherit;
  font-size: 13px;
}
.subtitle {
  margin: 0;
  padding: 4px 10px 6px;
  color: #78716c;
  font-size: 11px;
  line-height: 1.4;
  border-bottom: 1px solid #f2f4f5;
}
.subtitle.placeholder { color: #c4bfba; }
.subtitle-input {
  width: 100%;
  border: 1px solid #e7e3dc;
  border-radius: 4px;
  height: 24px;
  padding: 0 6px;
  font: inherit;
  font-size: 11px;
}
.field {
  position: relative;
  min-height: 26px;
  display: grid;
  grid-template-columns: 13px minmax(48px, 1fr) auto auto minmax(52px, 88px) minmax(48px, 1fr) 14px;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  border-top: 1px solid #f2f4f5;
  font-size: 12.5px;
  color: #1c1917;
}
.card:not(.wide) .field {
  grid-template-columns: 13px minmax(48px, 1fr) auto auto minmax(52px, 88px) 14px;
}
.card:not(.wide) .comment,
.card:not(.wide) .comment-input { display: none; }
.field.drop { background: #ecfdf5; }
.del {
  position: absolute;
  left: -2px;
  top: 4px;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 4px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
}
.field:hover .del { opacity: 1; }
.icon { width: 13px; height: 13px; grid-column: 1; }
.icon.link { fill: #94a3b8; }
.spacer { display: block; }
.name, .name-input {
  grid-column: 2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-input {
  border: 1px solid #e7e3dc;
  border-radius: 4px;
  height: 22px;
  padding: 0 4px;
  font: inherit;
  font-size: 12px;
}
.name.required { font-weight: 650; }
.mark { color: #b45309; font-size: 13px; font-weight: 700; }
.badge { color: #0f766e; font-size: 10px; font-weight: 700; }
.type {
  grid-column: 5;
  justify-self: end;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 0;
  background: #f8faf9;
  color: #8a847c;
  font-size: 11.5px;
  border-radius: 4px;
  padding: 2px 4px;
  cursor: pointer;
  white-space: nowrap;
}
.type:hover { background: #ecfdf5; color: #0f766e; }
.def {
  grid-column: 6;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #a8a29e;
  font-size: 10.5px;
  white-space: nowrap;
}
.comment, .comment-input {
  grid-column: 6;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #a8a29e;
  font-size: 11px;
}
.card.wide .def { grid-column: 7; }
.card.wide .comment, .card.wide .comment-input { grid-column: 6; }
.comment.empty { color: #d6d3d1; }
.comment-input {
  border: 1px solid #e7e3dc;
  border-radius: 4px;
  height: 22px;
  padding: 0 4px;
  font: inherit;
}
.handle {
  grid-column: -1;
  width: 12px;
  height: 12px;
  border-radius: 99px;
  background: #a8a29e;
  box-shadow: 0 0 0 2px #fff;
  cursor: crosshair;
}
.field:hover .handle { background: var(--header); }
.add-field {
  width: 100%;
  border: 0;
  border-top: 1px dashed #e7e5e4;
  background: #fafaf9;
  color: #78716c;
  height: 28px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.add-field:hover { background: #f0fdfa; color: #0f766e; }
footer {
  border-top: 1px dashed #e7e5e4;
  padding: 5px 10px 6px;
  color: #8a847c;
  font-size: 11px;
}
footer p { margin: 0; line-height: 1.45; }
.menu {
  position: fixed;
  z-index: 55;
  background: #fff;
  border: 1px solid #e4e1db;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.1);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.menu button {
  border: 0;
  background: transparent;
  text-align: left;
  border-radius: 6px;
  height: 28px;
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.menu button:hover { background: #f0fdfa; color: #0f766e; }
</style>
