export interface SourceRange {
  line: number
  column: number
  endLine: number
  endColumn: number
}

export interface TextSpan extends SourceRange {
  text: string
}

export function applySpan(text: string, span: TextSpan): string {
  const start = offsetOf(text, span.line, span.column)
  const end = offsetOf(text, span.endLine, span.endColumn)
  return text.slice(0, start) + span.text + text.slice(end)
}

export function insertBlock(text: string, block: string): { span: TextSpan; selectLine: number } {
  const trimmed = text.replace(/\s*$/, '')
  if (!trimmed) {
    const end = positionAt(text, text.length)
    return {
      span: { line: 1, column: 1, endLine: end.line, endColumn: end.column, text: `${block}\n` },
      selectLine: 1,
    }
  }
  const lines = trimmed.split('\n')
  const last = lines.length
  const column = lines[last - 1].length + 1
  const end = positionAt(text, text.length)
  return {
    span: {
      line: last,
      column,
      endLine: end.line,
      endColumn: end.column,
      text: `\n\n${block}\n`,
    },
    selectLine: last + 2,
  }
}

/**
 * Remove a ref token. Inline settings also drop the neighbouring comma;
 * a statement that occupies its line is removed with that line.
 */
export function deleteRange(text: string, range: SourceRange): TextSpan {
  if (range.line === range.endLine) {
    const lines = text.split('\n')
    const line = lines[range.line - 1] ?? ''
    if (coversLine(line, range.column, range.endColumn)) {
      return deleteWholeLine(text, range.line)
    }
    const nextLine = deleteInline(line, range.column, range.endColumn)
    return {
      line: range.line,
      column: 1,
      endLine: range.line,
      endColumn: line.length + 1,
      text: nextLine,
    }
  }
  return {
    line: range.line,
    column: range.column,
    endLine: range.endLine,
    endColumn: range.endColumn,
    text: '',
  }
}

function deleteWholeLine(text: string, line: number): TextSpan {
  const lines = text.split('\n')
  if (line < 1 || line > lines.length) {
    return { line: 1, column: 1, endLine: 1, endColumn: 1, text: '' }
  }
  if (line < lines.length) {
    return { line, column: 1, endLine: line + 1, endColumn: 1, text: '' }
  }
  if (line === 1) {
    return { line: 1, column: 1, endLine: 1, endColumn: lines[0].length + 1, text: '' }
  }
  return {
    line: line - 1,
    column: lines[line - 2].length + 1,
    endLine: line,
    endColumn: lines[line - 1].length + 1,
    text: '',
  }
}

function deleteInline(line: string, startColumn: number, endColumn: number): string {
  let start = startColumn - 1
  let end = endColumn - 1
  let cursor = start - 1
  while (cursor >= 0 && line[cursor] === ' ') cursor -= 1
  if (line[cursor] === ',') {
    start = cursor
    while (start > 0 && line[start - 1] === ' ') start -= 1
  } else {
    cursor = end
    while (line[cursor] === ' ') cursor += 1
    if (line[cursor] === ',') {
      cursor += 1
      while (line[cursor] === ' ') cursor += 1
      end = cursor
    }
  }
  let next = line.slice(0, start) + line.slice(end)
  next = next.replace(/\[\s*\]/g, '')
  next = next.replace(/\[\s*,\s*/g, '[')
  next = next.replace(/\s*,\s*\]/g, ']')
  next = next.replace(/,\s*,/g, ',')
  next = next.replace(/[ \t]{2,}/g, ' ')
  next = next.replace(/[ \t]+\]/g, ']')
  return next.replace(/\s+$/g, '')
}

function coversLine(line: string, startColumn: number, endColumn: number): boolean {
  const contentStart = line.search(/\S/)
  if (contentStart < 0) return true
  return startColumn - 1 <= contentStart && endColumn - 1 >= line.trimEnd().length
}

function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n')
  let offset = 0
  const last = Math.min(line - 1, lines.length)
  for (let index = 0; index < last; index += 1) offset += lines[index].length + 1
  return offset + Math.max(0, column - 1)
}

function positionAt(text: string, offset: number): { line: number; column: number } {
  const sliced = text.slice(0, offset)
  const lines = sliced.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}
