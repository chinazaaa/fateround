'use client'

import type { RefObject } from 'react'

/**
 * Small CSV upload control for the Crossword / Word Search custom pools on the create page.
 * Shows a sample-download link, a format hint, a file button, and the parse result/errors.
 */
export function PuzzleUpload({
  sample,
  hint,
  buttonLabel,
  fileRef,
  error,
  summary,
  onFile,
}: {
  sample: { href: string; download: string }
  hint: string
  buttonLabel: string
  fileRef: RefObject<HTMLInputElement | null>
  error: string | null
  summary: string | null
  onFile: (file: File) => void | Promise<void>
}) {
  return (
    <div className="space-y-2 pt-1">
      <a href={sample.href} download={sample.download} className="inline-block text-sm text-[var(--primary)] underline">
        Download sample CSV
      </a>
      <p className="text-faint text-xs">{hint}</p>
      <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full py-2.5 text-sm">
        {buttonLabel}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) await onFile(file)
          e.target.value = ''
        }}
      />
      {summary && <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">{summary}</p>}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}
