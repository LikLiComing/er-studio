<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DiagramCanvas from '../canvas/DiagramCanvas.vue'
import { workspace } from '../workspace'
import { draftLabel, type Draft } from './store'

const props = defineProps<{
  drafts: Draft[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  edit: []
  discard: []
  clear: []
  blank: []
  cancel: []
}>()

const choice = ref(props.selectedId)

watch(() => props.selectedId, (id) => {
  choice.value = id
})

const current = computed(() => props.drafts.find((draft) => draft.id === choice.value) ?? props.drafts[0])

function onSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === '__clear__') {
    choice.value = props.selectedId
    emit('clear')
    return
  }
  choice.value = value
  emit('select', value)
}

</script>

<template>
  <div class="mask" @pointerdown.self="emit('cancel')">
    <section class="dialog" role="dialog" aria-labelledby="draft-title">
      <header class="head">
        <label id="draft-title" for="draft-select">选择一个草稿继续编辑</label>
        <select id="draft-select" :value="choice" @change="onSelect">
          <option v-for="draft in drafts" :key="draft.id" :value="draft.id">{{ draftLabel(draft) }}</option>
          <option value="__clear__">全部删除</option>
        </select>
      </header>
      <div class="preview">
        <DiagramCanvas readonly />
        <p v-if="current" class="stamp">{{ draftLabel(current) }}</p>
        <p v-if="workspace.issues[0]" class="error">{{ workspace.issues[0].message }}</p>
      </div>
      <footer>
        <span class="tools">
          <button type="button" class="quiet" @click="emit('blank')">空白图</button>
        </span>
        <span class="actions">
          <button type="button" @click="emit('cancel')">取消</button>
          <button type="button" @click="emit('discard')">丢弃</button>
          <button type="button" class="primary" @click="emit('edit')">编辑</button>
        </span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(28, 25, 23, 0.28);
}
.dialog {
  width: min(980px, 100%);
  height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: #fffcf8;
  border: 1px solid rgba(28, 25, 23, 0.08);
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(28, 25, 23, 0.18);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px 12px;
}
label {
  color: #44403c;
  font-size: 14px;
  white-space: nowrap;
}
select {
  min-width: min(420px, 100%);
  height: 34px;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: #fff;
  color: #1c1917;
  font: inherit;
  font-size: 14px;
  padding: 0 8px;
}
.preview {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 18px;
  border: 1px solid #e7e5e4;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.stamp, .error {
  position: absolute;
  left: 12px;
  margin: 0;
  font-size: 12px;
  pointer-events: none;
}
.stamp { top: 10px; color: #a8a29e; }
.error { top: 28px; color: #b91c1c; }
.preview :deep(.viewport) { flex: 1; min-height: 0; }
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 16px;
}
.tools, .actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
button {
  height: 34px;
  border: 1px solid #e7e5e4;
  border-radius: 6px;
  background: #fff;
  color: #1c1917;
  font: inherit;
  font-size: 14px;
  padding: 0 14px;
  cursor: pointer;
}
button:hover { background: #f7f6f3; }
.quiet { color: #57534e; }
.primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}
.primary:hover { background: #2563eb; }
</style>
