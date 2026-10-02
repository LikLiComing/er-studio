<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  types: string[]
  value: string
  x: number
  y: number
}>()

const emit = defineEmits<{
  pick: [value: string]
  close: []
}>()

const draft = ref(props.value)
const filtered = computed(() => {
  const query = draft.value.trim().toLowerCase()
  if (!query) return props.types
  return props.types.filter((item) => item.toLowerCase().includes(query))
})

function submit(): void {
  emit('pick', draft.value.trim() || props.value)
}
</script>

<template>
  <Teleport to="body">
  <div class="picker type-picker" :style="{ left: `${x}px`, top: `${y}px` }" @pointerdown.stop @click.stop>
    <input v-model="draft" class="input" placeholder="类型" @keydown.enter.prevent="submit" @keydown.esc.prevent="emit('close')">
    <button v-for="item in filtered.slice(0, 12)" :key="item" type="button" class="item" @click="emit('pick', item)">{{ item }}</button>
    <button type="button" class="item apply" @click="submit">确定</button>
  </div>
  </Teleport>
</template>

<style scoped>
.picker {
  position: fixed;
  z-index: 60;
  width: 180px;
  max-height: 240px;
  overflow: auto;
  padding: 6px;
  background: #fff;
  border: 1px solid #e4e1db;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(28, 25, 23, 0.12);
}
.input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e7e3dc;
  border-radius: 6px;
  height: 28px;
  padding: 0 8px;
  font: inherit;
  font-size: 12px;
  margin-bottom: 4px;
}
.item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 6px;
  height: 26px;
  padding: 0 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.item:hover { background: #f0fdfa; color: #0f766e; }
.apply { margin-top: 4px; color: #0f766e; font-weight: 600; }
</style>
