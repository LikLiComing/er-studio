export type RefOp = '<' | '>' | '-' | '<>'

export interface OptionalMark {
  line: number
  column: number
  op: RefOp
  left: boolean
  right: boolean
}

/**
 * The published parser does not accept `?` on relationship operators yet.
 * Replace those marks with spaces so columns stay aligned, and remember which side was optional.
 */
export function neutralizeOptional(src: string): { text: string; marks: OptionalMark[] } {
  const chars = src.split('')
  const marks: OptionalMark[] = []
  let i = 0
  let line = 1
  let column = 1
  let mode: 'code' | 'line' | 'block' | 'str' | 'triple' | 'tick' = 'code'

  const bump = (count: number) => {
    for (let n = 0; n < count; n += 1) {
      const ch = chars[i + n]
      if (ch === '\n') {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
  }

  while (i < chars.length) {
    const c = chars[i]
    const next = chars[i + 1] ?? ''
    const third = chars[i + 2] ?? ''

    if (mode === 'line') {
      if (c === '\n') mode = 'code'
      bump(1)
      i += 1
      continue
    }
    if (mode === 'block') {
      if (c === '*' && next === '/') {
        mode = 'code'
        bump(2)
        i += 2
        continue
      }
      bump(1)
      i += 1
      continue
    }
    if (mode === 'str') {
      if (c === '\\' && next) {
        bump(2)
        i += 2
        continue
      }
      if (c === "'") mode = 'code'
      bump(1)
      i += 1
      continue
    }
    if (mode === 'triple') {
      if (c === "'" && next === "'" && third === "'") {
        mode = 'code'
        bump(3)
        i += 3
        continue
      }
      bump(1)
      i += 1
      continue
    }
    if (mode === 'tick') {
      if (c === '\\' && next) {
        bump(2)
        i += 2
        continue
      }
      if (c === '`') mode = 'code'
      bump(1)
      i += 1
      continue
    }

    if (c === '/' && next === '/') {
      mode = 'line'
      bump(2)
      i += 2
      continue
    }
    if (c === '/' && next === '*') {
      mode = 'block'
      bump(2)
      i += 2
      continue
    }
    if (c === "'" && next === "'" && third === "'") {
      mode = 'triple'
      bump(3)
      i += 3
      continue
    }
    if (c === "'") {
      mode = 'str'
      bump(1)
      i += 1
      continue
    }
    if (c === '`') {
      mode = 'tick'
      bump(1)
      i += 1
      continue
    }

    if (c === '?' || c === '<' || c === '>' || c === '-') {
      let j = i
      let left = false
      while (chars[j] === '?') {
        left = true
        j += 1
      }
      const head = chars[j]
      let op: RefOp | '' = ''
      if (head === '<' && chars[j + 1] === '>') op = '<>'
      else if (head === '<' || head === '>' || head === '-') op = head
      if (op) {
        const opAt = j
        j += op.length
        let right = false
        while (chars[j] === '?') {
          right = true
          j += 1
        }
        const before = chars[i - 1] ?? ' '
        const after = chars[j] ?? ' '
        const minusNumber = op === '-' && !left && !right && /[\d.]/.test(after)
        const looksLikeOp = op !== '-' || left || right || /[\s,)\]:]/.test(before)
        if (!minusNumber && looksLikeOp && (left || right)) {
          let opColumn = column
          for (let k = i; k < opAt; k += 1) {
            if (chars[k] !== '\n') opColumn += 1
          }
          marks.push({ line, column: opColumn, op, left, right })
          for (let k = i; k < j; k += 1) {
            if (chars[k] === '?') chars[k] = ' '
          }
          bump(j - i)
          i = j
          continue
        }
      }
    }

    bump(1)
    i += 1
  }

  return { text: chars.join(''), marks }
}
