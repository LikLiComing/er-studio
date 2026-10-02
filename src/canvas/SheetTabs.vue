<script setup lang="ts">
import { ref } from 'vue'
import { addSheet, deleteSheet, renameSheet, reorderSheets, switchSheet, workspace } from '../workspace'

const editingId = ref('')
const editingName = ref('')
const dragFrom = ref(-1)

function startRename(id: string, name: string): void {
  editingId.value = id
  editingName.value = name
}

function commitRename(): void {
  if (editingId.value) renameSheet(editingId.value, editingName.value)
  editingId.value = ''
  editingName.value = ''
}

function onDragStart(index: number, event: DragEvent): void {
  dragFrom.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDrop(index: number, event: DragEvent): void {
  event.preventDefault()
  const from = dragFrom.value
  dragFrom.value = -1
  if (from < 0) return
  reorderSheets(from, index)
}
</script>

<template>
  <div class="tabs" @dragover.prevent>
    <div
      v-for="(sheet, index) in workspace.sheets"
      :key="sheet.id"
      class="tab"
      :class="{ active: sheet.id === workspace.activeSheetId }"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @drop="onDrop(index, $event)"
      @click="switchSheet(sheet.id)"
    >
      <input
        v-if="editingId === sheet.id"
        v-model="editingName"
        class="rename"
        @click.stop
        @keydown.enter.stop.prevent="commitRename()"
        @blur="commitRename()"
      />
      <span v-else class="label" @dblclick.stop="startRename(sheet.id, sheet.name)">{{ sheet.name }}</span>
      <button
        v-if="workspace.sheets.length > 1"
        type="button"
        class="close"
        title="删除此页"
        @click.stop="deleteSheet(sheet.id)"
      >
        ×
      </button>
    </div>
    <button type="button" class="add" title="添加页面" @click="addSheet">+</button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 6px 10px;
  background: #fffcf8;
  border-top: 1px solid #e7e3dc;
  overflow-x: auto;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  padding: 0 8px 0 10px;
  height: 28px;
  border: 1px solid #e4e1db;
  border-radius: 8px 8px 0 0;
  background: #f7f6f3;
  color: #57534e;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.tab.active {
  background: #fff;
  border-bottom-color: #fff;
  color: #1c1917;
  box-shadow: 0 -1px 0 #fff;
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rename {
  width: 120px;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  outline: none;
}
.close, .add {
  border: 0;
  background: transparent;
  color: #78716c;
  font-size: 16px;
  line-height: 1;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
}
.close:hover, .add:hover { background: #ece9e4; }
.add {
  flex: none;
  border: 1px dashed #d6d3d1;
  font-size: 18px;
}
</style>
