const DBML_TYPE: FilePickerAcceptType = {
  description: 'DBML',
  accept: { 'text/plain': ['.dbml'] },
}

export function canBindDeviceFile(): boolean {
  return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function'
}

export async function openDeviceFile(): Promise<{
  name: string
  text: string
  handle: FileSystemFileHandle | null
} | null> {
  if (canBindDeviceFile() && window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [DBML_TYPE],
      })
      const file = await handle.getFile()
      return { name: file.name, text: await file.text(), handle }
    } catch (error) {
      if (isAbort(error)) return null
      throw error
    }
  }
  return pickWithInput()
}

export async function saveDeviceFile(
  handle: FileSystemFileHandle | null,
  suggestedName: string,
  text: string,
  saveAs: boolean,
): Promise<{ name: string; handle: FileSystemFileHandle | null; downloaded: boolean } | null> {
  if (!saveAs && handle) {
    await writeHandle(handle, text)
    return { name: handle.name, handle, downloaded: false }
  }
  if (canBindDeviceFile() && window.showSaveFilePicker) {
    try {
      const next = await window.showSaveFilePicker({
        suggestedName: suggestedName.endsWith('.dbml') ? suggestedName : `${suggestedName}.dbml`,
        types: [DBML_TYPE],
      })
      await writeHandle(next, text)
      return { name: next.name, handle: next, downloaded: false }
    } catch (error) {
      if (isAbort(error)) return null
      throw error
    }
  }
  const name = suggestedName.endsWith('.dbml') ? suggestedName : `${suggestedName}.dbml`
  downloadText(name, text)
  return { name, handle: null, downloaded: true }
}

async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function pickWithInput(): Promise<{ name: string; text: string; handle: null } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.dbml,text/plain'
    let settled = false
    const finish = (value: { name: string; text: string; handle: null } | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      finish({ name: file.name, text: await file.text(), handle: null })
    })
    window.addEventListener('focus', () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null)
      }, 500)
    }, { once: true })
    input.click()
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
