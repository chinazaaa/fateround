export type ShareImageResult = 'shared' | 'copied' | 'downloaded'

function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false
  try {
    const file = new File([''], 'share.png', { type: 'image/png' })
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

function canCopyImage(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined'
}

function prefersNativeShare(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && canShareFiles()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Share image via native sheet (mobile), clipboard (desktop), or download fallback. */
export async function shareImageBlob(blob: Blob, filename = 'secret-message.png'): Promise<ShareImageResult> {
  if (prefersNativeShare()) {
    const file = new File([blob], filename, { type: 'image/png' })
    try {
      await navigator.share({ files: [file], title: 'Secret message' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }

  if (canCopyImage()) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': Promise.resolve(blob) }),
      ])
      return 'copied'
    } catch {
      // Clipboard can reject large images — fall through to download.
    }
  }

  downloadBlob(blob, filename)
  return 'downloaded'
}
