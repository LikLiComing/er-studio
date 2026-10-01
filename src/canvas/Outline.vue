<script setup lang="ts">
import { computed, ref } from 'vue'
import { focusNode, jumpTo, workspace } from '../workspace'

const query = ref('')

const needle = computed(() => query.value.trim().toLowerCase())

const tables = computed(() => workspace.model.tables.filter((table) => matches(table.label)))
const enums = computed(() => workspace.model.enums.filter((item) => matches(item.label)))

function matches(label: string): boolean {
  return !needle.value || label.toLowerCase().includes(needle.value)
}

function openIssue(line: number): void {
  jumpTo(line)
}
</script>

<template>
  <aside class="outline" @pointerdown.stop>
    <input v-model="query" type="search" placeholder="搜索表或枚举" aria-label="搜索表或枚举" />
    <div v-if="workspace.issues.length" class="group">
      <p>解析错误</p>
      <button v-for="(issue, index) in workspace.issues" :key="index" type="button" class="row error" @click="openIssue(issue.line)">
        第 {{ issue.line }} 行 · {{ issue.message }}
      </button>
    </div>
    <div class="group">
      <p>表</p>
      <button v-for="table in tables" :key="table.id" type="button" class="row" :class="{ on: workspace.selectedId === table.id }" @click="focusNode(table.id)">
        <i :style="{ background: table.headerColor }" />
        {{ table.label }}
      </button>
      <p v-if="tables.length === 0" class="empty">没有匹配的表</p>
    </div>
    <div v-if="enums.length" class="group">
      <p>枚举</p>
      <button v-for="item in enums" :key="item.id" type="button" class="row" :class="{ on: workspace.selectedId === item.id }" @click="focusNode(item.id)">
        {{ item.label }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.outline {
  position: absolute;
  z-index: 3;
  left: 12px;
  top: 12px;
  width: min(260px, calc(100% - 24px));
  max-height: min(420px, calc(100% - 72px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  overflow: auto;
  background: #fffcf8;
  border: 1px solid #e7e3dc;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(28, 25, 23, 0.08);
}
input {
  width: 100%;
  height: 32px;
  border: 1px solid #e7e3dc;
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  font: inherit;
  font-size: 13px;
}
.group p {
  margin: 4px 2px;
  color: #a8a29e;
  font-size: 11px;
  letter-spacing: 0.06em;
}
.row {
  width: 100%;
  height: auto;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-size: 13px;
}
.row.on { background: #f0fdfa; }
.row i {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  flex: none;
}
.row.error { color: #b91c1c; }
.empty {
  margin: 0 2px 6px;
  color: #a8a29e;
  font-size: 12px;
}
</style>
