import type { ParseIssue } from './types'

export function explainIssues(issues: ParseIssue[], source: string): ParseIssue[] {
  const lines = source.split(/\r?\n/)
  return issues.map((issue) => ({
    ...issue,
    message: explain(issue.message, lines[issue.line - 1] ?? ''),
  }))
}

function explain(message: string, line: string): string {
  if (/Invalid column type/i.test(message)) {
    if (/,\s*$/.test(line)) return '字段行末尾不用写逗号'
    if (/[A-Za-z0-9_)\]]\[(?=[A-Za-z'"`])/.test(line)) return '类型和方括号之间要空一格，例如 phone varchar [not null]'
    if (/\([^)]*$/.test(line)) return '类型的括号还没写完，例如 decimal(10,2)'
    return '字段类型写得不对。写成 phone varchar，或 price decimal(10,2)'
  }
  if (/Invalid column reference/i.test(message)) return '关系要写成「表.字段」，不能只写字段名'
  if (/A column must have a type/i.test(message)) return '字段还缺类型，例如 phone varchar'
  if (/A column name must be/i.test(message)) return '字段名要是标识符，中间有空格时用引号包起来'
  const setting = message.match(/Unknown column setting '(.+)'/i)
  if (setting) return `不认识字段设置 ${setting[1]}。可用 pk、unique、not null、increment、default、note、ref`
  if (/Inline column settings can only be/i.test(message)) return 'not null 这类设置要放进方括号，例如 phone varchar [not null]'
  if (/These fields must be some inline settings/i.test(message)) return '这一行不像字段。写成「名字 类型」，设置放在方括号里'
  const token = message.match(/Unexpected token '(.+)'/)
  if (token) {
    if (token[1] === '（' || token[1] === '）') return '括号要用英文半角 ()'
    if (token[1] === '，') return '逗号要用英文半角 ,'
    return `这里不能出现「${token[1]}」`
  }
  const missing = message.match(/Table '(.+)' does not exist/)
  if (missing) return `表 ${missing[1]} 不存在`
  if (/Expect an opening brace/i.test(message)) return '这里应该开始一个 { } 代码块'
  if (/Expect a comma/i.test(message)) return '类型参数还没写完，例如 decimal(10,2)'
  if (/Invalid start of operand/i.test(message)) return '这一行还没写完'
  if (/Custom element/i.test(message)) return '这一行无法当成字段或表来读'
  return message
}
