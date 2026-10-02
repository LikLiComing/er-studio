import { reactive } from 'vue'
import { clearDrafts, deleteDraft, listDrafts, readDraft, saveDraft, type Draft } from './drafts/store'
import { canBindDeviceFile, openDeviceFile, saveDeviceFile } from './file/device-file'
import {
  defaultSheet,
  parseDocumentFile,
  serializeDocumentFile,
  type DocumentSnapshot,
  type SheetSnapshot,
} from './model/document-io'
import { appendLayout, extractLayout } from './model/layout-comment'
import { ensureParser } from './model/parser-loader'
import { beautifyPositions, reconcilePositions } from './model/layout'
import { dbmlIdent, inferenceKey, locateNode, parseDbml, parserReady, refOperator } from './model/parse'
import { routeKey } from './model/route'
import { SAMPLE_DBML } from './model/sample'
import { applySpan, deleteRange, insertBlock, type TextSpan } from './model/text-edit'
import type { ParseIssue, Point, RefView, SchemaModel } from './model/types'

export interface FocusRequest {
  id: string
  nonce: number
  zoom: boolean
}

export interface JumpRequest {
  line: number
  nonce: number
}

export type RefOp = '<' | '>' | '-' | '<>'

const emptyModel: SchemaModel = { tables: [], enums: [], refs: [], enumLinks: [], omitted: [] }

interface LayoutSnapshot {
  positions: Record<string, Point>
  routes: Record<string, Point[]>
  hiddenInferences: string[]
}

interface EditorApi {
  applyEdit: (span: TextSpan, selectLine?: number) => void
  undo: () => void
  redo: () => void
  getValue: () => string
  switchSheet: (sheetId: string, text: string) => void
}

let fileHandle: FileSystemFileHandle | null = null
let parseTimer = 0
let noteTimer = 0
let focusNonce = 0
let jumpNonce = 0
let restoring = false
let undoOwner: 'layout' | 'text' = 'text'
let redoPrefersLayout = false
const layoutUndoBySheet = new Map<string, LayoutSnapshot[]>()
const layoutRedoBySheet = new Map<string, LayoutSnapshot[]>()
let editorApi: EditorApi | null = null
let draftId: string | null = null
let draftCreatedAt = 0
let persistTimer = 0
let persistSuspended = false

export const workspace = reactive({
  screen: 'start' as 'start' | 'editor',
  fileName: '未命名.dbml',
  boundToDevice: false,
  downloadOnly: !canBindDeviceFile(),
  dirty: false,
  dbml: '',
  positions: {} as Record<string, Point>,
  routes: {} as Record<string, Point[]>,
  hiddenInferences: [] as string[],
  showInferred: true,
  outlineOpen: false,
  omittedDismissed: false,
  model: emptyModel as SchemaModel,
  issues: [] as ParseIssue[],
  externalRev: 0,
  cursor: { line: 1, column: 1 },
  editorWidth: 520,
  editorVisible: true,
  zoom: 1,
  pan: { x: 40, y: 32 },
  selectedId: null as string | null,
  selectedRefId: null as string | null,
  focusRequest: null as FocusRequest | null,
  jumpRequest: null as JumpRequest | null,
  pendingFit: false,
  pendingSelectLine: 0,
  statusNote: '',
  sheets: [] as SheetSnapshot[],
  activeSheetId: '',
})

export function bindEditor(api: EditorApi | null): void {
  editorApi = api
}

export function createNew(): void {
  draftId = null
  draftCreatedAt = 0
  openText('', '未命名.dbml', null, false)
}

export function continueDraft(id: string): boolean {
  const draft = readDraft(id)
  if (!draft) return false
  loadDraft(draft, true)
  setNote('已恢复浏览器里的草稿。保存到本地文件时需要重新选择位置')
  return true
}

export function previewDraft(id: string): boolean {
  const draft = readDraft(id)
  if (!draft) return false
  loadDraft(draft, false)
  return true
}

export function discardDraft(id: string): Draft[] {
  if (draftId === id) {
    draftId = null
    draftCreatedAt = 0
  }
  deleteDraft(id)
  return listDrafts()
}

export function discardAllDrafts(): void {
  draftId = null
  draftCreatedAt = 0
  clearDrafts()
}

export function openSample(): void {
  openText(SAMPLE_DBML, '示例.dbml', null, false)
}

export async function openFromDevice(): Promise<void> {
  if (workspace.screen === 'editor' && workspace.dirty && !confirmDiscard()) return
  const picked = await openDeviceFile()
  if (!picked) return
  openText(picked.text, picked.name, picked.handle, false)
  rememberOpened()
}

export async function save(saveAs = false): Promise<void> {
  syncActiveSheet()
  const text = serializeDocumentFile(currentDocument())
  const suggested = workspace.fileName || 'diagram.dbml'
  try {
    const saved = await saveDeviceFile(saveAs ? null : fileHandle, suggested, text, saveAs)
    if (!saved) return
    fileHandle = saved.handle
    workspace.fileName = saved.name
    workspace.boundToDevice = Boolean(saved.handle)
    workspace.dirty = false
    schedulePersist()
    setNote(saved.downloaded ? '已下载副本' : '已保存')
  } catch (error) {
    setNote(error instanceof Error ? `保存失败：${error.message}` : '保存失败')
  }
}

export function backToStart(): void {
  if (workspace.dirty && !confirmDiscard()) return
  persistDraft()
  workspace.screen = 'start'
  workspace.dirty = false
}

export function setDbmlFromEditor(text: string): void {
  if (text === workspace.dbml) return
  workspace.dbml = text
  workspace.dirty = true
  if (!restoring) undoOwner = 'text'
  scheduleParse()
  schedulePersist()
}

export function selectNode(id: string | null): void {
  workspace.selectedId = id
  workspace.selectedRefId = null
}

export function selectRef(id: string | null): void {
  workspace.selectedRefId = id
  if (id) workspace.selectedId = null
}

export function focusNode(id: string): void {
  selectNode(id)
  focusNonce += 1
  workspace.focusRequest = { id, nonce: focusNonce, zoom: true }
}

export function toggleOutline(): void {
  workspace.outlineOpen = !workspace.outlineOpen
}

export function toggleInferred(): void {
  workspace.showInferred = !workspace.showInferred
  const selected = selectedRef()
  if (selected && !isRefVisible(selected)) workspace.selectedRefId = null
}

export function dismissOmitted(): void {
  workspace.omittedDismissed = true
}

export function isRefVisible(ref: RefView): boolean {
  if (!ref.inferred) return true
  if (!workspace.showInferred) return false
  return !workspace.hiddenInferences.includes(refKey(ref))
}

export function moveNode(id: string, x: number, y: number): void {
  workspace.positions[id] = { x, y }
  workspace.dirty = true
  schedulePersist()
}

export function setRoute(id: string, points: Point[]): void {
  if (points.length === 0) delete workspace.routes[id]
  else workspace.routes[id] = points
  workspace.dirty = true
  schedulePersist()
}

export function rememberLayout(): void {
  if (restoring) return
  const undo = layoutUndoStack()
  undo.push(captureLayout())
  if (undo.length > 50) undo.shift()
  layoutRedoStack().length = 0
  undoOwner = 'layout'
  redoPrefersLayout = false
}

export function beautifyDiagram(): void {
  if (workspace.model.tables.length === 0 && workspace.model.enums.length === 0) return
  rememberLayout()
  workspace.positions = beautifyPositions(workspace.model)
  workspace.routes = {}
  workspace.selectedId = null
  workspace.selectedRefId = null
  workspace.dirty = true
  schedulePersist()
  setNote('已按关联关系重新排版')
}

export function addRef(
  fromTableId: string,
  fromField: string,
  toTableId: string,
  toField: string,
  op: RefOp,
  fromOptional = false,
  toOptional = false,
): void {
  const operator = `${fromOptional ? '?' : ''}${op}${toOptional ? '?' : ''}`
  const statement = `Ref: ${dbmlIdent(fromTableId)}.${dbmlIdent(fromField)} ${operator} ${dbmlIdent(toTableId)}.${dbmlIdent(toField)}`
  const inserted = insertBlock(currentText(), statement)
  commitText(inserted.span, inserted.selectLine)
  setNote('已写入关系')
}

export function materializeSelected(): void {
  const ref = selectedRef()
  if (!ref?.inferred || ref.from.fields.length === 0 || ref.to.fields.length === 0) return
  const statement = `Ref: ${dbmlIdent(ref.from.tableId)}.${dbmlIdent(ref.from.fields[0])} ${refOperator(ref.fromCard, ref.toCard)} ${dbmlIdent(ref.to.tableId)}.${dbmlIdent(ref.to.fields[0])}`
  const inserted = insertBlock(currentText(), statement)
  commitText(inserted.span, inserted.selectLine)
  setNote('已写入文件')
}

export function deleteSelectedRef(): void {
  const ref = selectedRef()
  if (!ref) return
  if (ref.inferred) {
    rememberLayout()
    const key = refKey(ref)
    if (!workspace.hiddenInferences.includes(key)) workspace.hiddenInferences.push(key)
    workspace.selectedRefId = null
    workspace.dirty = true
    schedulePersist()
    setNote('已隐藏这条推断关系')
    return
  }
  if (ref.span.endLine < ref.span.line) {
    setNote('无法定位这条关系的源码')
    return
  }
  workspace.selectedRefId = null
  commitText(deleteRange(currentText(), ref.span))
  setNote('已从文件删除')
}

export function focusAtLine(line: number): void {
  const hit = locateNode(workspace.model, line)
  if (!hit) return
  workspace.selectedId = hit.kind === 'ref' ? null : hit.id
  workspace.selectedRefId = hit.kind === 'ref' ? hit.id : null
  const target = hit.kind === 'ref'
    ? workspace.model.refs.find((ref) => ref.id === hit.id)?.from.tableId
    : hit.id
  if (!target) return
  focusNonce += 1
  workspace.focusRequest = { id: target, nonce: focusNonce, zoom: true }
}

export function jumpTo(line: number): void {
  jumpNonce += 1
  workspace.jumpRequest = { line, nonce: jumpNonce }
  workspace.editorVisible = true
}

export function toggleEditor(): void {
  workspace.editorVisible = !workspace.editorVisible
}

export function undoChange(): boolean {
  const layoutUndo = layoutUndoStack()
  const layoutRedo = layoutRedoStack()
  if (undoOwner === 'layout' && layoutUndo.length > 0) {
    undoLayout()
    redoPrefersLayout = true
    if (layoutUndo.length === 0) undoOwner = 'text'
    setNote('已撤销排版')
    return true
  }
  if (editorUndo()) {
    redoPrefersLayout = false
    undoOwner = 'text'
    return true
  }
  if (layoutUndo.length > 0) {
    undoLayout()
    redoPrefersLayout = true
    setNote('已撤销排版')
    return true
  }
  return false
}

export function redoChange(): boolean {
  const layoutRedo = layoutRedoStack()
  if (redoPrefersLayout && layoutRedo.length > 0) {
    redoLayout()
    undoOwner = 'layout'
    setNote('已重做排版')
    return true
  }
  if (editorRedo()) {
    redoPrefersLayout = false
    undoOwner = 'text'
    return true
  }
  if (layoutRedo.length > 0) {
    redoLayout()
    undoOwner = 'layout'
    setNote('已重做排版')
    return true
  }
  return false
}

function loadDraft(draft: Draft, asSession: boolean): void {
  persistSuspended = true
  const doc: DocumentSnapshot = draft.sheets && draft.sheets.length > 0
    ? { sheets: draft.sheets.map(cloneSheet), activeSheetId: draft.activeSheetId || draft.sheets[0].id }
    : parseDocumentFile(appendLayout(draft.dbml, draft.positions ?? {}, draft.routes ?? {}, draft.hiddenInferences ?? []))
  openDocument(doc, draft.fileName || '未命名.dbml', null, asSession, false)
  workspace.zoom = draft.zoom || 1
  workspace.pan = draft.pan ?? { x: 40, y: 32 }
  if (draft.editorWidth) workspace.editorWidth = draft.editorWidth
  workspace.pendingFit = true
  if (asSession) {
    draftId = draft.id
    draftCreatedAt = draft.createdAt || draft.updatedAt
    workspace.screen = 'editor'
    workspace.dirty = true
  } else {
    draftId = null
    draftCreatedAt = 0
    workspace.screen = 'start'
    workspace.dirty = false
  }
  persistSuspended = false
}

function rememberOpened(): void {
  draftId = newDraftId()
  draftCreatedAt = Date.now()
  persistDraft()
}

function schedulePersist(): void {
  if (persistSuspended || workspace.screen !== 'editor') return
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(persistDraft, 400)
}

function persistDraft(): void {
  if (persistSuspended || typeof localStorage === 'undefined') return
  if (!draftId && !workspace.dirty) return
  if (!workspace.dbml.trim() && !workspace.dirty) return
  if (!draftId) {
    draftId = newDraftId()
    draftCreatedAt = Date.now()
  }
  try {
    syncActiveSheet()
    const active = activeSheet()
    saveDraft({
      id: draftId,
      fileName: workspace.fileName,
      dbml: active?.dbml ?? workspace.dbml,
      positions: { ...(active?.positions ?? workspace.positions) },
      routes: { ...(active?.routes ?? workspace.routes) },
      hiddenInferences: [...(active?.hiddenInferences ?? workspace.hiddenInferences)],
      sheets: workspace.sheets.map(cloneSheet),
      activeSheetId: workspace.activeSheetId,
      createdAt: draftCreatedAt,
      updatedAt: Date.now(),
      zoom: workspace.zoom,
      pan: { ...workspace.pan },
      editorWidth: workspace.editorWidth,
    })
  } catch {
    setNote('浏览器草稿写满了，这次没能自动留下')
  }
}

function openText(text: string, name: string, handle: FileSystemFileHandle | null, dirty: boolean, fit = true): void {
  openDocument(parseDocumentFile(text), name, handle, dirty, fit)
}

function openDocument(doc: DocumentSnapshot, name: string, handle: FileSystemFileHandle | null, dirty: boolean, fit = true): void {
  fileHandle = handle
  layoutUndoBySheet.clear()
  layoutRedoBySheet.clear()
  undoOwner = 'text'
  redoPrefersLayout = false
  workspace.fileName = name
  workspace.boundToDevice = Boolean(handle)
  workspace.sheets = doc.sheets.length > 0 ? doc.sheets.map(cloneSheet) : [defaultSheet()]
  workspace.activeSheetId = doc.activeSheetId || workspace.sheets[0].id
  workspace.dirty = dirty
  workspace.screen = 'editor'
  workspace.selectedId = null
  workspace.selectedRefId = null
  workspace.zoom = 1
  workspace.pan = { x: 40, y: 32 }
  workspace.editorVisible = true
  workspace.editorWidth = Math.round(Math.min(560, Math.max(320, window.innerWidth * 0.38)))
  workspace.pendingFit = fit
  workspace.pendingSelectLine = 0
  workspace.omittedDismissed = false
  workspace.statusNote = ''
  void ensureParser().finally(() => runParse())
  applyActiveSheet(fit)
}

function applyActiveSheet(fit: boolean): void {
  const sheet = activeSheet()
  if (!sheet) return
  restoring = true
  workspace.dbml = sheet.dbml
  workspace.positions = { ...sheet.positions }
  workspace.routes = { ...sheet.routes }
  workspace.hiddenInferences = [...sheet.hiddenInferences]
  restoring = false
  workspace.externalRev += 1
  editorApi?.switchSheet(sheet.id, sheet.dbml)
  runParse()
  if (fit) workspace.pendingFit = true
}

function syncActiveSheet(): void {
  const sheet = activeSheet()
  if (!sheet) return
  sheet.dbml = editorApi?.getValue() ?? workspace.dbml
  sheet.positions = { ...workspace.positions }
  sheet.routes = { ...workspace.routes }
  sheet.hiddenInferences = [...workspace.hiddenInferences]
}

function activeSheet(): SheetSnapshot | undefined {
  return workspace.sheets.find((sheet) => sheet.id === workspace.activeSheetId) ?? workspace.sheets[0]
}

function currentDocument(): DocumentSnapshot {
  return { sheets: workspace.sheets.map(cloneSheet), activeSheetId: workspace.activeSheetId }
}

function cloneSheet(sheet: SheetSnapshot): SheetSnapshot {
  return {
    id: sheet.id,
    name: sheet.name,
    dbml: sheet.dbml,
    positions: { ...sheet.positions },
    routes: Object.fromEntries(Object.entries(sheet.routes).map(([id, points]) => [id, points.map((point) => ({ ...point }))])),
    hiddenInferences: [...sheet.hiddenInferences],
  }
}

function layoutUndoStack(): LayoutSnapshot[] {
  const id = workspace.activeSheetId || 'default'
  let stack = layoutUndoBySheet.get(id)
  if (!stack) {
    stack = []
    layoutUndoBySheet.set(id, stack)
  }
  return stack
}

function layoutRedoStack(): LayoutSnapshot[] {
  const id = workspace.activeSheetId || 'default'
  let stack = layoutRedoBySheet.get(id)
  if (!stack) {
    stack = []
    layoutRedoBySheet.set(id, stack)
  }
  return stack
}

export function switchSheet(id: string): void {
  if (id === workspace.activeSheetId) return
  syncActiveSheet()
  workspace.activeSheetId = id
  layoutUndoStack().length = 0
  layoutRedoStack().length = 0
  undoOwner = 'text'
  redoPrefersLayout = false
  workspace.selectedId = null
  workspace.selectedRefId = null
  applyActiveSheet(true)
  workspace.dirty = true
  schedulePersist()
}

export function addSheet(): void {
  syncActiveSheet()
  const index = workspace.sheets.length + 1
  const sheet = defaultSheet(`页 ${index}`)
  workspace.sheets.push(sheet)
  switchSheet(sheet.id)
  setNote('已添加新页')
}

export function renameSheet(id: string, name: string): void {
  const sheet = workspace.sheets.find((item) => item.id === id)
  if (!sheet) return
  const trimmed = name.trim()
  sheet.name = trimmed || sheet.name
  workspace.dirty = true
  schedulePersist()
}

export function deleteSheet(id: string): void {
  if (workspace.sheets.length <= 1) return
  const sheet = workspace.sheets.find((item) => item.id === id)
  if (!sheet) return
  if (!window.confirm(`删除「${sheet.name}」？此页内容将无法恢复。`)) return
  syncActiveSheet()
  workspace.sheets = workspace.sheets.filter((item) => item.id !== id)
  layoutUndoBySheet.delete(id)
  layoutRedoBySheet.delete(id)
  if (workspace.activeSheetId === id) {
    workspace.activeSheetId = workspace.sheets[0].id
    applyActiveSheet(true)
  }
  workspace.dirty = true
  schedulePersist()
  setNote('已删除页面')
}

export function reorderSheets(fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
  if (fromIndex >= workspace.sheets.length || toIndex >= workspace.sheets.length) return
  syncActiveSheet()
  const next = [...workspace.sheets]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  workspace.sheets = next
  workspace.dirty = true
  schedulePersist()
}

function scheduleParse(): void {
  window.clearTimeout(parseTimer)
  parseTimer = window.setTimeout(runParse, 160)
}

function runParse(): void {
  if (!parserReady()) return
  const text = workspace.dbml
  const result = parseDbml(text)
  if (text !== workspace.dbml) return
  if (result.ok) {
    workspace.model = result.model
    workspace.issues = []
    workspace.positions = reconcilePositions(workspace.positions, result.model)
    if (workspace.selectedId && !hasNode(workspace.selectedId)) workspace.selectedId = null
    if (workspace.selectedRefId && !workspace.model.refs.some((ref) => ref.id === workspace.selectedRefId && isRefVisible(ref))) {
      workspace.selectedRefId = null
    }
    const line = workspace.pendingSelectLine
    if (line) {
      workspace.pendingSelectLine = 0
      const hit = locateNode(workspace.model, line)
      if (hit?.kind === 'ref') selectRef(hit.id)
    }
  } else {
    workspace.issues = result.issues
    workspace.pendingSelectLine = 0
  }
}

function commitText(span: TextSpan, selectLine = 0): void {
  undoOwner = 'text'
  redoPrefersLayout = false
  workspace.pendingSelectLine = selectLine
  workspace.dirty = true
  if (editorApi) {
    editorApi.applyEdit(span, selectLine)
    return
  }
  workspace.dbml = applySpan(workspace.dbml, span)
  workspace.externalRev += 1
  runParse()
}

function currentText(): string {
  return editorApi?.getValue() ?? workspace.dbml
}

function selectedRef(): RefView | undefined {
  return workspace.model.refs.find((ref) => ref.id === workspace.selectedRefId)
}

function refKey(ref: RefView): string {
  return inferenceKey(ref.from.tableId, ref.from.fields[0] ?? '', ref.to.tableId, ref.to.fields[0] ?? '')
}

function visibleRoutes(): Record<string, Point[]> {
  const keys = new Set(workspace.model.refs.filter(isRefVisible).map((ref) => routeKey(ref)))
  const routes: Record<string, Point[]> = {}
  for (const [id, points] of Object.entries(workspace.routes)) {
    if (keys.has(id) && points.length > 0) routes[id] = points
  }
  return routes
}

function visiblePositions(): Record<string, Point> {
  const ids = new Set([
    ...workspace.model.tables.map((table) => table.id),
    ...workspace.model.enums.map((item) => item.id),
  ])
  const positions: Record<string, Point> = {}
  for (const [id, point] of Object.entries(workspace.positions)) {
    if (ids.has(id)) positions[id] = point
  }
  return positions
}

function hasNode(id: string): boolean {
  return workspace.model.tables.some((table) => table.id === id)
    || workspace.model.enums.some((item) => item.id === id)
}

function captureLayout(): LayoutSnapshot {
  return {
    positions: Object.fromEntries(Object.entries(workspace.positions).map(([id, point]) => [id, { ...point }])),
    routes: Object.fromEntries(Object.entries(workspace.routes).map(([id, points]) => [id, points.map((point) => ({ ...point }))])),
    hiddenInferences: [...workspace.hiddenInferences],
  }
}

function restoreLayout(snapshot: LayoutSnapshot): void {
  restoring = true
  workspace.positions = snapshot.positions
  workspace.routes = snapshot.routes
  workspace.hiddenInferences = snapshot.hiddenInferences
  workspace.dirty = true
  restoring = false
  schedulePersist()
  const selected = selectedRef()
  if (selected && !isRefVisible(selected)) workspace.selectedRefId = null
}

function undoLayout(): void {
  const layoutUndo = layoutUndoStack()
  const layoutRedo = layoutRedoStack()
  const prev = layoutUndo.pop()
  if (!prev) return
  layoutRedo.push(captureLayout())
  restoreLayout(prev)
}

function redoLayout(): void {
  const layoutUndo = layoutUndoStack()
  const layoutRedo = layoutRedoStack()
  const next = layoutRedo.pop()
  if (!next) return
  layoutUndo.push(captureLayout())
  restoreLayout(next)
}

function editorUndo(): boolean {
  if (!editorApi) return false
  const before = editorApi.getValue()
  editorApi.undo()
  return editorApi.getValue() !== before
}

function editorRedo(): boolean {
  if (!editorApi) return false
  const before = editorApi.getValue()
  editorApi.redo()
  return editorApi.getValue() !== before
}

function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function confirmDiscard(): boolean {
  return window.confirm('当前修改尚未保存，确定放弃并继续？')
}

function setNote(message: string): void {
  workspace.statusNote = message
  window.clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => {
    if (workspace.statusNote === message) workspace.statusNote = ''
  }, 2600)
}

function typingTarget(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('.monaco-editor, input, textarea, select, [contenteditable="true"]'))
}

export function installWindowGuards(): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (workspace.screen !== 'editor') return
    const meta = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (meta && key === 's') {
      event.preventDefault()
      event.stopPropagation()
      void save(event.shiftKey)
      return
    }
    if (meta && event.key === '\\') {
      event.preventDefault()
      event.stopPropagation()
      toggleEditor()
      return
    }
    if (meta && key === 'z') {
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey) redoChange()
      else undoChange()
      return
    }
    if (meta && key === 'y') {
      event.preventDefault()
      event.stopPropagation()
      redoChange()
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !typingTarget(event) && workspace.selectedRefId) {
      event.preventDefault()
      event.stopPropagation()
      deleteSelectedRef()
    }
  }
  const onLeave = (event: BeforeUnloadEvent) => {
    persistDraft()
    if (workspace.screen === 'editor' && workspace.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('beforeunload', onLeave)
  window.addEventListener('pagehide', persistDraft)
  const onParserReady = () => runParse()
  window.addEventListener('er-studio-parser-ready', onParserReady)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('beforeunload', onLeave)
    window.removeEventListener('pagehide', persistDraft)
    window.removeEventListener('er-studio-parser-ready', onParserReady)
  }
}

export async function exportCurrentSql(dialect: 'postgres' | 'mysql'): Promise<string> {
  syncActiveSheet()
  const { exportSql } = await import('./model/sql-exchange')
  return exportSql(workspace.dbml, dialect)
}

export async function importSqlAsNewSheet(sql: string, dialect: 'postgres' | 'mysql'): Promise<void> {
  const { importSql } = await import('./model/sql-exchange')
  const dbml = await importSql(sql, dialect)
  syncActiveSheet()
  const sheet = defaultSheet(`SQL 页 ${workspace.sheets.length + 1}`)
  sheet.dbml = `${dbml.trim()}\n`
  workspace.sheets.push(sheet)
  switchSheet(sheet.id)
  setNote('已从 SQL 导入到新页')
}
