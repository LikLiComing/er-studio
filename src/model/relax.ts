const FULLWIDTH: Record<string, string> = {
  '（': '(',
  '）': ')',
  '，': ',',
  '：': ':',
  '；': ';',
  '【': '[',
  '】': ']',
}

/**
 * Accept field lines people write while adding a column.
 * The published parser rejects a trailing comma, a missing space before `[`,
 * fullwidth punctuation, and `character varying`.
 */
export function relaxFieldSyntax(source: string): string {
  const normalized = mapCode(source, (char) => FULLWIDTH[char] ?? char)
  return rewriteFieldLines(normalized)
}

function rewriteFieldLines(source: string): string {
  const lines = source.split('\n')
  let depth = 0
  let tableDepth = -1
  return lines.map((line) => {
    const code = stripLine(line)
    const trimmed = code.trim()
    if (/^table\b/i.test(trimmed)) tableDepth = depth
    const inside = tableDepth >= 0 && depth > tableDepth
    const next = inside && isFieldLine(trimmed) ? rewriteField(line) : line
    depth += braceDelta(code)
    if (tableDepth >= 0 && depth <= tableDepth) tableDepth = -1
    return next
  }).join('\n')
}

function isFieldLine(trimmed: string): boolean {
  if (!trimmed || trimmed.startsWith('//')) return false
  if (/^(table|enum|ref|note|indexes|project|tablegroup)\b/i.test(trimmed)) return false
  if (trimmed === '{' || trimmed === '}' || trimmed.startsWith('}')) return false
  return true
}

function rewriteField(line: string): string {
  let next = line.replace(/\bcharacter\s+varying\b/gi, 'varchar')
  next = next.replace(/([A-Za-z0-9_)\]])\s*\[(?=[A-Za-z'"`])/g, '$1 [')
  next = next.replace(/,\s*$/, '')
  return liftConstraints(next)
}

function liftConstraints(line: string): string {
  if (line.includes('[')) return line
  const match = line.match(/^(\s*)(\S+)\s+([A-Za-z_][\w]*(?:\([^)\n]*\))?)\s+(.+)$/)
  if (!match) return line
  const rest = match[4].trim()
  if (!/^(?:pk|primary\s+key|unique|not\s+null|null|increment|autoincrement|auto_increment)(?:\s+(?:pk|primary\s+key|unique|not\s+null|null|increment|autoincrement|auto_increment))*$/i.test(rest)) {
    return line
  }
  const settings = rest
    .replace(/primary\s+key/gi, 'pk')
    .replace(/auto_?increment/gi, 'increment')
    .split(/\s+/)
    .join(', ')
  return `${match[1]}${match[2]} ${match[3]} [${settings}]`
}

function mapCode(source: string, mapChar: (char: string) => string): string {
  const chars = source.split('')
  let mode: 'code' | 'line' | 'block' | 'str' | 'triple' | 'tick' = 'code'
  let i = 0
  while (i < chars.length) {
    const char = chars[i]
    const next = chars[i + 1] ?? ''
    const third = chars[i + 2] ?? ''
    if (mode === 'line') {
      if (char === '\n') mode = 'code'
      i += 1
      continue
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code'
        i += 2
        continue
      }
      i += 1
      continue
    }
    if (mode === 'str') {
      if (char === '\\') {
        i += 2
        continue
      }
      if (char === "'") mode = 'code'
      i += 1
      continue
    }
    if (mode === 'triple') {
      if (char === "'" && next === "'" && third === "'") {
        mode = 'code'
        i += 3
        continue
      }
      i += 1
      continue
    }
    if (mode === 'tick') {
      if (char === '\\') {
        i += 2
        continue
      }
      if (char === '`') mode = 'code'
      i += 1
      continue
    }
    if (char === '/' && next === '/') {
      mode = 'line'
      i += 2
      continue
    }
    if (char === '/' && next === '*') {
      mode = 'block'
      i += 2
      continue
    }
    if (char === "'" && next === "'" && third === "'") {
      mode = 'triple'
      i += 3
      continue
    }
    if (char === "'") {
      mode = 'str'
      i += 1
      continue
    }
    if (char === '`') {
      mode = 'tick'
      i += 1
      continue
    }
    chars[i] = mapChar(char)
    i += 1
  }
  return chars.join('')
}

function stripLine(line: string): string {
  let mode: 'code' | 'str' | 'tick' = 'code'
  let out = ''
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1] ?? ''
    if (mode === 'code' && char === '/' && next === '/') break
    if (mode === 'str') {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === "'") mode = 'code'
      continue
    }
    if (mode === 'tick') {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === '`') mode = 'code'
      continue
    }
    if (char === "'") {
      mode = 'str'
      continue
    }
    if (char === '`') {
      mode = 'tick'
      continue
    }
    out += char
  }
  return out
}

function braceDelta(code: string): number {
  let delta = 0
  for (const char of code) {
    if (char === '{') delta += 1
    if (char === '}') delta -= 1
  }
  return delta
}
