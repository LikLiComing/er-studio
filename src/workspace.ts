import { reactive } from 'vue'
import { canBindDeviceFile, openDeviceFile, saveDeviceFile } from './file/device-file'
import { appendLayout, extractLayout } from './model/layout-comment'
import { beautifyPositions, reconcilePositions } from './model/layout'
import { dbmlIdent, locateNode, parseDbml } from './model/parse'
import { routeKey } from './model/route'
import { SAMPLE_DBML } from './model/sample'
import type { ParseIssue, Point, SchemaModel } from './model/types'

export interface FocusRequest {
  id: string
  nonce: number
}

export interface JumpRequest {
  line: number
  nonce: number
}

const emptyModel: SchemaModel = { tables: [], enums: [], refs: [] }

let fileHandle: FileSystemFileHandle | null = null
let parseTimer = 0
let noteTimer = 0
let focusNonce = 0
let jumpNonce = 0

export const workspace = reactive({
  screen: 'start' as 'start' | 'editor',
  fileName: '未命名.dbml',
  boundToDevice: false,
  downloadOnly: !canBindDeviceFile(),
  dirty: false,
  dbml: '',
  positions: {} as Record<string, Point>,
  routes: {} as Record<string, Point[]>,
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
  statusNote: '',
})

export function createNew(): void {
  openText(SAMPLE_DBML, '未命名.dbml', null, true)
}

export async function openFromDevice(): Promise<void> {
  if (workspace.screen === 'editor' && workspace.dirty && !confirmDiscard()) return
  const picked = await openDeviceFile()
  if (!picked) return
  openText(picked.text, picked.name, picked.handle, false)
}

export async function save(saveAs = false): Promise<void> {
  const text = appendLayout(workspace.dbml, visiblePositions(), visibleRoutes())
  const suggested = workspace.fileName || 'diagram.dbml'
  try {
    const saved = await saveDeviceFile(saveAs ? null : fileHandle, suggested, text, saveAs)
    if (!saved) return
    fileHandle = saved.handle
    workspace.fileName = saved.name
    workspace.boundToDevice = Boolean(saved.handle)
    workspace.dirty = false
    setNote(saved.downloaded ? '已下载副本' : '已保存')
  } catch (error) {
    setNote(error instanceof Error ? `保存失败：${error.message}` : '保存失败')
  }
}

export function backToStart(): void {
  if (workspace.dirty && !confirmDiscard()) return
  workspace.screen = 'start'
  workspace.dirty = false
}

export function setDbmlFromEditor(text: string): void {
  if (text === workspace.dbml) return
  workspace.dbml = text
  workspace.dirty = true
  scheduleParse()
}

export function moveNode(id: string, x: number, y: number): void {
  workspace.positions[id] = { x, y }
  workspace.dirty = true
}

export function setRoute(id: string, points: Point[]): void {
  if (points.length === 0) delete workspace.routes[id]
  else workspace.routes[id] = points
  workspace.dirty = true
}

export function beautifyDiagram(): void {
  if (workspace.model.tables.length === 0 && workspace.model.enums.length === 0) return
  workspace.positions = beautifyPositions(workspace.model)
  workspace.routes = {}
  workspace.selectedId = null
  workspace.selectedRefId = null
  workspace.dirty = true
  setNote('已按关联关系重新排版')
}

export function addRef(fromTableId: string, fromField: string, toTableId: string, toField: string): void {
  const line = `Ref: ${dbmlIdent(fromTableId)}.${dbmlIdent(fromField)} > ${dbmlIdent(toTableId)}.${dbmlIdent(toField)}`
  const base = extractLayout(workspace.dbml).dbml.replace(/\s*$/, '')
  workspace.dbml = `${base}\n\n${line}\n`
  workspace.dirty = true
  workspace.externalRev += 1
  runParse()
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
  workspace.focusRequest = { id: target, nonce: focusNonce }
}

export function jumpTo(line: number): void {
  jumpNonce += 1
  workspace.jumpRequest = { line, nonce: jumpNonce }
  workspace.editorVisible = true
}

export function toggleEditor(): void {
  workspace.editorVisible = !workspace.editorVisible
}

function openText(text: string, name: string, handle: FileSystemFileHandle | null, dirty: boolean): void {
  const extracted = extractLayout(text)
  fileHandle = handle
  workspace.fileName = name
  workspace.boundToDevice = Boolean(handle)
  workspace.dbml = extracted.dbml
  workspace.positions = extracted.positions
  workspace.routes = extracted.routes
  workspace.dirty = dirty
  workspace.screen = 'editor'
  workspace.selectedId = null
  workspace.selectedRefId = null
  workspace.zoom = 1
  workspace.pan = { x: 40, y: 32 }
  workspace.editorVisible = true
  workspace.editorWidth = Math.round(Math.min(560, Math.max(320, window.innerWidth * 0.38)))
  workspace.pendingFit = true
  workspace.externalRev += 1
  workspace.statusNote = ''
  runParse()
}

function scheduleParse(): void {
  window.clearTimeout(parseTimer)
  parseTimer = window.setTimeout(runParse, 160)
}

function runParse(): void {
  const text = workspace.dbml
  const result = parseDbml(text)
  if (text !== workspace.dbml) return
  if (result.ok) {
    workspace.model = result.model
    workspace.issues = []
    workspace.positions = reconcilePositions(workspace.positions, result.model)
    if (workspace.selectedId && !hasNode(workspace.selectedId)) workspace.selectedId = null
  } else {
    workspace.issues = result.issues
  }
}

function visibleRoutes(): Record<string, Point[]> {
  const keys = new Set(workspace.model.refs.map((ref) => routeKey(ref)))
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

export function installWindowGuards(): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (workspace.screen !== 'editor') return
    const meta = event.ctrlKey || event.metaKey
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault()
      event.stopPropagation()
      void save(event.shiftKey)
    } else if (meta && event.key === '\\') {
      event.preventDefault()
      event.stopPropagation()
      toggleEditor()
    }
  }
  const onLeave = (event: BeforeUnloadEvent) => {
    if (workspace.screen === 'editor' && workspace.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('beforeunload', onLeave)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('beforeunload', onLeave)
  }
}
