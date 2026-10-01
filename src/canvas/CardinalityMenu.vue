<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { RefOp } from '../workspace'

defineProps<{
  x: number
  y: number
  sameTable: boolean
}>()

const emit = defineEmits<{
  choose: [op: RefOp, fromOptional: boolean, toOptional: boolean]
  cancel: []
}>()

const fromOptional = ref(false)
const toOptional = ref(false)

const options: { op: RefOp; label: string }[] = [
  { op: '>', label: '多对一' },
  { op: '<', label: '一对多' },
  { op: '-', label: '一对一' },
  { op: '<>', label: '多对多' },
]

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('cancel')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="menu" :style="{ left: `${x}px`, top: `${y}px` }" @pointerdown.stop>
    <p>{{ sameTable ? '建立自关联' : '建立关系' }}</p>
    <label><input v-model="fromOptional" type="checkbox" />起点可空</label>
    <label><input v-model="toOptional" type="checkbox" />终点可空</label>
    <div class="ops">
      <button v-for="option in options" :key="option.op" type="button" @click="emit('choose', option.op, fromOptional, toOptional)">
        {{ option.label }}
      </button>
    </div>
    <button type="button" class="cancel" @click="emit('cancel')">取消</button>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  z-index: 5;
  width: 196px;
  display: grid;
  gap: 6px;
  padding: 10px;
  background: #fffcf8;
  border: 1px solid #e7e3dc;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(28, 25, 23, 0.12);
}
p {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
}
label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #57534e;
  font-size: 12px;
}
.ops {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
button {
  height: 30px;
  border: 1px solid #e7e3dc;
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
button:hover { background: #f0fdfa; }
.cancel { color: #78716c; }
</style>
