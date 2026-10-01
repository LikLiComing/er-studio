<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DiagramCanvas from './canvas/DiagramCanvas.vue'
import DraftPicker from './drafts/DraftPicker.vue'
import { listDrafts, type Draft } from './drafts/store'
import DbmlEditor from './editor/DbmlEditor.vue'
import { backToStart, beautifyDiagram, continueDraft, createNew, deleteSelectedRef, discardAllDrafts, discardDraft, dismissOmitted, isRefVisible, jumpTo, materializeSelected, openFromDevice, openSample, previewDraft, save, toggleEditor, toggleInferred, toggleOutline, workspace } from './workspace'

const canvas = ref<{ fit: () => void; zoomBy: (factor: number) => void } | null>(null)
const splitting = ref(false)
const pickerOpen = ref(false)
const drafts = ref<Draft[]>([])
const pickerId = ref('')

const issueText = computed(() => {
  const issue = workspace.issues[0]
  if (!issue) return ''
  const extra = workspace.issues.length > 1 ? `，共 ${workspace.issues.length} 处` : ''
  return `${issue.message}（第 ${issue.line} 行${extra}）`
})

const summary = computed(() => {
  const tables = workspace.model.tables.length
  const refs = workspace.model.refs.filter(isRefVisible).length
  return `${tables} 张表 · ${refs} 条关系`
})

const selectedRef = computed(() => workspace.model.refs.find((ref) => ref.id === workspace.selectedRefId) ?? null)

const omittedText = computed(() => {
  if (workspace.omittedDismissed || workspace.model.omitted.length === 0) return ''
  return `文件含有 ${workspace.model.omitted.join('、')}，图上未画出`
})

onMounted(() => {
  openPickerIfAny()
})

function openPickerIfAny(): void {
  drafts.value = listDrafts()
  if (drafts.value.length === 0) return
  pickerId.value = drafts.value[0].id
  previewDraft(pickerId.value)
  pickerOpen.value = true
}

function enterWorkspace(): void {
  if (listDrafts().length === 0) {
    createNew()
    return
  }
  openPickerIfAny()
}

function selectPicked(id: string): void {
  pickerId.value = id
  previewDraft(id)
}

function editPicked(): void {
  if (!continueDraft(pickerId.value)) return
  pickerOpen.value = false
}

function discardPicked(): void {
  drafts.value = discardDraft(pickerId.value)
  if (drafts.value.length === 0) {
    pickerOpen.value = false
    return
  }
  pickerId.value = drafts.value[0].id
  previewDraft(pickerId.value)
}

function clearPicked(): void {
  if (!window.confirm('删除全部草稿？')) {
    pickerId.value = drafts.value[0]?.id ?? ''
    return
  }
  discardAllDrafts()
  drafts.value = []
  pickerOpen.value = false
}

function startBlank(): void {
  pickerOpen.value = false
  createNew()
}

function startSplit(event: PointerEvent): void {
  splitting.value = true
  const startX = event.clientX
  const startW = workspace.editorWidth
  const move = (ev: PointerEvent) => {
    const max = Math.min(window.innerWidth * 0.5, window.innerWidth - 280)
    workspace.editorWidth = Math.round(Math.min(max, Math.max(240, startW + ev.clientX - startX)))
  }
  const up = () => {
    splitting.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <section v-if="workspace.screen === 'start'" class="start">
    <div class="card">
      <p class="mark">ER</p>
      <h1>数据库关系工作站</h1>
      <p class="lede">左边写表结构，右边实时画出关系。编辑会留在这个浏览器里，下次进入可以接着草稿。</p>
      <p v-if="workspace.downloadOnly" class="browser">此浏览器保存时会下载副本，不能直接写回原文件。</p>
      <p v-if="drafts.length && !pickerOpen" class="browser">这个浏览器里有 {{ drafts.length }} 个草稿，点进入可以继续。</p>
      <div class="actions">
        <button type="button" class="primary" @click="enterWorkspace">进入</button>
        <button type="button" @click="openSample">从示例开始</button>
        <button type="button" @click="openFromDevice">打开本地 DBML</button>
      </div>
    </div>
  </section>

  <div v-else class="shell">
    <header class="bar">
      <button type="button" class="home" @click="backToStart">开始页</button>
      <strong>ER 工作站</strong>
      <span class="file" :title="workspace.fileName">{{ workspace.fileName }}</span>
      <em v-if="workspace.dirty">未保存</em>
      <span class="spacer" />
      <button type="button" :class="{ on: workspace.outlineOpen }" title="搜索并定位表" @click="toggleOutline">表</button>
      <button type="button" :class="{ on: workspace.editorVisible }" title="显示或隐藏编辑器（Ctrl+\）" @click="toggleEditor">编辑器</button>
      <button type="button" :class="{ on: workspace.showInferred }" title="虚线是按字段名推断的外键，未写入文件" @click="toggleInferred">推断</button>
      <button type="button" :disabled="workspace.model.tables.length === 0 && workspace.model.enums.length === 0" title="按关联关系分组并减少连线交叉，可撤销" @click="beautifyDiagram(); canvas?.fit()">一键美化</button>
      <button type="button" @click="canvas?.fit()">适应</button>
      <button type="button" @click="openFromDevice">打开</button>
      <button type="button" class="primary" @click="save(false)">保存</button>
      <button type="button" @click="save(true)">另存为</button>
    </header>
    <div class="body" :class="{ splitting }">
      <DbmlEditor v-show="workspace.editorVisible" class="pane" :style="{ width: `${workspace.editorWidth}px` }" />
      <div
        v-show="workspace.editorVisible"
        class="splitter"
        @pointerdown.prevent="startSplit"
      />
      <DiagramCanvas ref="canvas" />
    </div>
    <footer class="status">
      <span>{{ summary }}</span>
      <button v-if="issueText" type="button" class="error linkish" @click="jumpTo(workspace.issues[0].line)">{{ issueText }}</button>
      <span v-else-if="selectedRef?.inferred">推断关系，未写入文件</span>
      <span v-else-if="selectedRef">拖节点改走线 · 双击拐点取消 · Delete 删除</span>
      <span v-else class="hint">双击跳到源码 · 拖字段圆点建关系</span>
      <button v-if="selectedRef?.inferred" type="button" class="linkish" @click="materializeSelected">写入文件</button>
      <button v-if="selectedRef" type="button" class="linkish" @click="deleteSelectedRef">{{ selectedRef.inferred ? '隐藏推断' : '删除关系' }}</button>
      <button v-if="omittedText" type="button" class="linkish" :title="omittedText" @click="dismissOmitted">{{ omittedText }}</button>
      <span v-if="workspace.statusNote" class="note">{{ workspace.statusNote }}</span>
      <span v-if="workspace.downloadOnly" class="hint">此浏览器保存时会下载副本</span>
      <span class="spacer" />
      <span class="zoom-inline">
        <button type="button" @click="canvas?.zoomBy(1 / 1.12)">缩小</button>
        <button type="button" @click="canvas?.zoomBy(1.12)">放大</button>
      </span>
      <span>Ln {{ workspace.cursor.line }}, Col {{ workspace.cursor.column }}</span>
    </footer>
  </div>
  <DraftPicker
    v-if="pickerOpen"
    :drafts="drafts"
    :selected-id="pickerId"
    @select="selectPicked"
    @edit="editPicked"
    @discard="discardPicked"
    @clear="clearPicked"
    @blank="startBlank"
    @cancel="pickerOpen = false"
  />
</template>

<style scoped>
.start {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background:
    radial-gradient(circle at 1px 1px, rgba(28, 25, 23, 0.08) 1px, transparent 0) 0 0 / 18px 18px,
    #e7ecee;
}
.card {
  width: min(460px, 100%);
  padding: 36px 32px 32px;
  background: #fffcf8;
  border: 1px solid rgba(28, 25, 23, 0.08);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(28, 25, 23, 0.08);
}
.mark {
  margin: 0 0 18px;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: #0f766e;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  display: grid;
  place-items: center;
}
h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.03em;
}
.lede {
  margin: 12px 0 0;
  color: #57534e;
  font-size: 15px;
  line-height: 1.6;
}
.browser {
  margin: 14px 0 0;
  color: #a8a29e;
  font-size: 13px;
  line-height: 1.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 28px;
}
button {
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
button:hover { background: #f7f6f3; }
.primary {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.primary:hover { background: #0d675f; }
.on, button.on:hover {
  background: #f0fdfa;
  border-color: #99f6e4;
  color: #0f766e;
}
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f6f3;
}
.bar, .status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #fffcf8;
  border-bottom: 1px solid #e7e3dc;
}
.bar { height: 48px; flex: none; }
.status {
  height: 30px;
  border-bottom: 0;
  border-top: 1px solid #e7e3dc;
  color: #78716c;
  font-size: 12px;
  overflow: hidden;
}
.home { padding-inline: 8px; }
.file {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #44403c;
  font-size: 13px;
}
em {
  font-style: normal;
  color: #b45309;
  font-size: 12px;
}
.spacer { flex: 1; }
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.pane { flex: none; }
.splitter {
  width: 6px;
  flex: none;
  cursor: col-resize;
  background: linear-gradient(#e7e3dc, #e7e3dc) center / 1px 100% no-repeat;
}
.splitter:hover, .splitting .splitter { background-color: #d7efe9; }
.error { color: #b91c1c; }
.note { color: #0f766e; }
.hint { color: #a8a29e; }
.linkish {
  height: 22px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: #57534e;
  font-size: 12px;
}
.linkish.error { color: #b91c1c; }
.linkish:hover { background: #f5f5f4; }
.zoom-inline { display: none; gap: 4px; }
.zoom-inline button {
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
}
@media (max-width: 860px) {
  .hint { display: none; }
  .bar { height: auto; flex-wrap: wrap; padding: 8px; }
  .body { flex-direction: column; }
  .pane { width: 100% !important; height: 38vh; }
  .splitter { display: none; }
  .file { max-width: 140px; }
  .zoom-inline { display: flex; }
}
</style>
