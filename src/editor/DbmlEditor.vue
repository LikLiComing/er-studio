<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/min/vs/editor/editor.main.css'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { registerDbml } from './dbml-language'
import { bindEditor, focusAtLine, setDbmlFromEditor, workspace } from '../workspace'
import type { TextSpan } from '../model/text-edit'

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let applying = false

onMounted(() => {
  const global = globalThis as typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } }
  global.MonacoEnvironment = { getWorker: () => new editorWorker() }
  registerDbml(monaco)
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: workspace.dbml,
    language: 'dbml',
    theme: 'er-studio',
    fontSize: 13.5,
    fontFamily: '"Cascadia Mono", Consolas, "Sarasa Mono SC", monospace',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: 'line',
    overviewRulerLanes: 0,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    fixedOverflowWidgets: true,
  })
  editor.onDidChangeModelContent(() => {
    if (applying || !editor) return
    const value = editor.getValue()
    setDbmlFromEditor(value)
  })
  editor.onDidChangeCursorPosition((event) => {
    workspace.cursor = { line: event.position.lineNumber, column: event.position.column }
  })
  editor.onMouseDown((event) => {
    if (!(event.event.ctrlKey || event.event.metaKey) || !event.target.position) return
    event.event.preventDefault()
    event.event.stopPropagation()
    focusAtLine(event.target.position.lineNumber)
  })
  bindEditor({
    applyEdit,
    undo: () => editor?.trigger('er-studio', 'undo', null),
    redo: () => editor?.trigger('er-studio', 'redo', null),
    getValue: () => editor?.getValue() ?? workspace.dbml,
  })
  applyMarkers()
})

watch(() => workspace.externalRev, () => {
  if (!editor || editor.getValue() === workspace.dbml) return
  applying = true
  editor.setValue(workspace.dbml)
  applying = false
})

watch(() => workspace.issues, applyMarkers, { deep: true })

watch(() => workspace.jumpRequest, (request) => {
  if (!editor || !request) return
  editor.revealLineInCenter(request.line)
  editor.setPosition({ lineNumber: request.line, column: 1 })
  editor.focus()
})

onBeforeUnmount(() => {
  bindEditor(null)
  editor?.dispose()
  editor = null
})

function applyEdit(span: TextSpan, selectLine?: number): void {
  if (!editor) return
  editor.executeEdits('er-studio', [{
    range: new monaco.Range(span.line, span.column, span.endLine, span.endColumn),
    text: span.text,
    forceMoveMarkers: true,
  }])
  if (!selectLine) return
  const column = editor.getModel()?.getLineMaxColumn(selectLine) ?? 1
  editor.setSelection(new monaco.Range(selectLine, 1, selectLine, column))
  editor.revealLineInCenter(selectLine)
  editor.focus()
}

function applyMarkers(): void {
  const model = editor?.getModel()
  if (!model) return
  monaco.editor.setModelMarkers(model, 'dbml', workspace.issues.map((issue) => ({
    startLineNumber: issue.line,
    startColumn: issue.column,
    endLineNumber: issue.endLine,
    endColumn: issue.endColumn,
    message: issue.message,
    severity: monaco.MarkerSeverity.Error,
  })))
}
</script>

<template>
  <div class="editor">
    <div class="label">DBML</div>
    <div ref="host" class="host" />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #fbfcfd;
  border-right: 1px solid #e4e7eb;
}
.label {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  color: #8b9390;
  font-size: 11px;
  letter-spacing: 0.14em;
  border-bottom: 1px solid #eef1f2;
}
.host {
  flex: 1;
  min-height: 0;
}
</style>
