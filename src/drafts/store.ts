import { migrateLegacyDraft, type SheetSnapshot } from '../model/document-io'
import type { Point } from '../model/types'

const KEY = 'er-studio.drafts.v1'
const MAX_DRAFTS = 20

export interface Draft {
  id: string
  fileName: string
  dbml: string
  positions: Record<string, Point>
  routes: Record<string, Point[]>
  hiddenInferences: string[]
  sheets?: SheetSnapshot[]
  activeSheetId?: string
  createdAt: number
  updatedAt: number
  zoom: number
  pan: Point
  editorWidth: number
}

export function listDrafts(): Draft[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function readDraft(id: string): Draft | null {
  return readAll().find((draft) => draft.id === id) ?? null
}

export function saveDraft(draft: Draft): void {
  const next = readAll().filter((item) => item.id !== draft.id)
  next.push(draft)
  next.sort((a, b) => b.updatedAt - a.updatedAt)
  writeAll(next.slice(0, MAX_DRAFTS))
}

export function deleteDraft(id: string): void {
  writeAll(readAll().filter((draft) => draft.id !== id))
}

export function clearDrafts(): void {
  writeAll([])
}

export function draftLabel(draft: Draft): string {
  const range = `${formatStamp(draft.createdAt)} - ${formatStamp(draft.updatedAt)}`
  if (!draft.fileName || draft.fileName === '未命名.dbml') return range
  return `${range} · ${draft.fileName}`
}

export function formatStamp(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function readAll(): Draft[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isDraft).map(normalizeDraft)
  } catch {
    return []
  }
}

function writeAll(drafts: Draft[]): void {
  localStorage.setItem(KEY, JSON.stringify(drafts))
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<Draft>
  return typeof draft.id === 'string' && typeof draft.dbml === 'string' && typeof draft.updatedAt === 'number'
}

function normalizeDraft(draft: Draft): Draft {
  if (draft.sheets && draft.sheets.length > 0) return draft
  const doc = migrateLegacyDraft(draft)
  const active = doc.sheets.find((sheet) => sheet.id === doc.activeSheetId) ?? doc.sheets[0]
  return {
    ...draft,
    sheets: doc.sheets,
    activeSheetId: doc.activeSheetId,
    dbml: active.dbml,
    positions: active.positions,
    routes: active.routes,
    hiddenInferences: active.hiddenInferences,
  }
}
