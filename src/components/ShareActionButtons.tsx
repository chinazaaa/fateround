'use client'

/** Share (native/clipboard) + explicit Download buttons, laid out side by side. */
export function ShareActionButtons({
  shareLabel,
  onShare,
  onDownload,
  sharing,
  downloading,
  downloadLabel = 'Download',
  primary = false,
}: {
  shareLabel: string
  onShare: () => void
  onDownload: () => void
  sharing: boolean
  downloading: boolean
  downloadLabel?: string
  /** Render the Share button as the primary action (results screens). */
  primary?: boolean
}) {
  const busy = sharing || downloading

  return (
    <div className="flex w-full min-w-0 gap-2">
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        className={`${primary ? 'btn-primary' : 'btn-secondary'} flex-1 min-w-0 py-3 text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
        </svg>
        <span className="truncate">{sharing ? 'Sharing…' : shareLabel}</span>
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        aria-label={downloadLabel}
        title={downloadLabel}
        className="btn-secondary shrink-0 px-3 py-3 flex items-center justify-center disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
      </button>
    </div>
  )
}
