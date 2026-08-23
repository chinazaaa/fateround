'use client'

import { useState, type RefObject } from 'react'
import { SegmentedControl } from '@/components/ui/CreateWizard'

/**
 * Small CSV control for the Crossword / Word Search / Word Scramble custom pools on the
 * create page. Offers two ways to supply the pool — upload a .csv file, or paste CSV text
 * directly — plus a sample-download link, a format hint, and the parse result/errors.
 * Both paths feed the same `onText(text)` handler, so the parser doesn't care which was used.
 */
export function PuzzleUpload({
  sample,
  hint,
  buttonLabel,
  fileRef,
  error,
  summary,
  onText,
  accept = '.csv,text/csv',
  pastePlaceholder = 'Paste your rows here (one per line, CSV format)',
  pasteButtonLabel = 'Import pasted words',
}: {
  sample: { href: string; download: string }
  hint: string
  buttonLabel: string
  fileRef: RefObject<HTMLInputElement | null>
  error: string | null
  summary: string | null
  onText: (text: string) => void | Promise<void>
  accept?: string
  pastePlaceholder?: string
  pasteButtonLabel?: string
}) {
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [paste, setPaste] = useState('')

  return (
    <div className="space-y-2 pt-1">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upload', label: 'Upload file' },
          { value: 'paste', label: 'Paste' },
        ]}
      />
      <a href={sample.href} download={sample.download} className="inline-block text-sm text-[var(--primary)] underline">
        Download sample CSV
      </a>
      <p className="text-faint text-xs">{hint}</p>
      {tab === 'upload' ? (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary w-full py-2.5 text-sm"
          >
            {buttonLabel}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await onText(await file.text())
              e.target.value = ''
            }}
          />
        </>
      ) : (
        <>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={pastePlaceholder}
            rows={6}
            className="input-field w-full text-sm"
          />
          <button
            type="button"
            onClick={() => onText(paste)}
            disabled={!paste.trim()}
            className="btn-secondary w-full py-2.5 text-sm"
          >
            {pasteButtonLabel}
          </button>
        </>
      )}
      {summary && <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">{summary}</p>}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}
