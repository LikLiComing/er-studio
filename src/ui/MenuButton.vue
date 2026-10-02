<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  label: string
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node) || !root.value?.contains(target)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))

defineExpose({ close })
</script>

<template>
  <div ref="root" class="menu-root">
    <button type="button" class="menu-trigger" @click.stop="toggle">{{ label }} ▾</button>
    <div v-if="open" class="menu-panel" role="menu" @click="close">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.menu-root {
  position: relative;
  flex: none;
}
.menu-trigger {
  border: 1px solid #e4e1db;
  background: #fff;
  color: #1c1917;
  border-radius: 8px;
  height: 34px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.menu-trigger:hover {
  background: #f7f6f3;
}
.menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  padding: 6px;
  background: #fffcf8;
  border: 1px solid #e7e3dc;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(28, 25, 23, 0.1);
}
.menu-panel :deep(.menu-group) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.menu-panel :deep(.menu-group + .menu-group) {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #ece9e4;
}
.menu-panel :deep(.menu-label) {
  padding: 2px 8px 4px;
  color: #a8a29e;
  font-size: 11px;
}
.menu-panel :deep(.menu-item) {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: #1c1917;
  border-radius: 6px;
  height: 30px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.menu-panel :deep(.menu-item:hover:not(:disabled)) {
  background: #f0fdfa;
  color: #0f766e;
}
.menu-panel :deep(.menu-item:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
