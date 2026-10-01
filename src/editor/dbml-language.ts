import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'

let registered = false

export function registerDbml(monaco: typeof Monaco): void {
  if (registered) return
  registered = true
  monaco.languages.register({ id: 'dbml' })
  monaco.languages.setLanguageConfiguration('dbml', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#region\b/,
        end: /^\s*\/\/\s*#endregion\b/,
      },
    },
  })
  monaco.languages.setMonarchTokensProvider('dbml', {
    ignoreCase: true,
    keywords: ['table', 'ref', 'enum', 'indexes', 'note', 'project', 'tablegroup', 'as'],
    settings: ['pk', 'primary', 'key', 'unique', 'not', 'null', 'increment', 'default', 'note', 'ref', 'headercolor', 'color', 'name', 'type', 'delete', 'update'],
    tokenizer: {
      root: [
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
        [/'''/, 'string', '@triple'],
        [/'/, 'string', '@string'],
        [/`/, 'string', '@tick'],
        [/\b(table|ref|enum|indexes|note|project|tablegroup|as)\b/, 'keyword'],
        [/\b(pk|primary|key|unique|not|null|increment|default|note|ref|headercolor|color|name|type|delete|update)\b/, 'type'],
        [/<>|\?|<|>|-/, 'operator'],
        [/\d+(\.\d+)?/, 'number'],
        [/[A-Za-z_][\w]*/, 'identifier'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
      string: [
        [/\\./, 'string'],
        [/'/, 'string', '@pop'],
        [/./, 'string'],
      ],
      triple: [
        [/'''/, 'string', '@pop'],
        [/./, 'string'],
      ],
      tick: [
        [/\\./, 'string'],
        [/`/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  })
  monaco.editor.defineTheme('er-studio', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0f766e', fontStyle: 'bold' },
      { token: 'type', foreground: 'b45309' },
      { token: 'comment', foreground: '9aa0a6', fontStyle: 'italic' },
      { token: 'string', foreground: '047857' },
      { token: 'number', foreground: 'c2410c' },
      { token: 'operator', foreground: '1d4ed8' },
    ],
    colors: {
      'editor.background': '#fbfcfd',
      'editorLineNumber.foreground': '#c5cad1',
      'editorLineNumber.activeForeground': '#3f4a45',
      'editor.lineHighlightBackground': '#f3f6f5',
      'editorCursor.foreground': '#0f766e',
    },
  })
}
