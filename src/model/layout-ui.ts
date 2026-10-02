export const MIN_CANVAS_WIDTH = 260
export const MAX_EDITOR_WIDTH = 560
export const MIN_EDITOR_WIDTH = 240

/** Keep the diagram pane visible after restoring drafts or resizing the window. */
export function clampEditorWidth(width: number, innerWidth: number): number {
  const maxByViewport = Math.max(MIN_EDITOR_WIDTH, innerWidth - MIN_CANVAS_WIDTH - 16)
  const max = Math.min(MAX_EDITOR_WIDTH, maxByViewport)
  return Math.round(Math.min(max, Math.max(MIN_EDITOR_WIDTH, width)))
}
