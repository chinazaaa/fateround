'use client'

import { Modal } from '@/components/ui/Modal'

type FreshnessResult = {
  fresh: boolean
  totalPool: number
  seenByMost: number
  seenPercent: number
  authenticatedPlayers: number
  totalPlayers: number
}

export type { FreshnessResult }

export function FreshnessWarningModal({
  open,
  onClose,
  result,
  onStartAnyway,
  onUploadCsv,
  onBrowseLibrary,
}: {
  open: boolean
  onClose: () => void
  result: FreshnessResult
  onStartAnyway: () => void
  onUploadCsv?: () => void
  onBrowseLibrary?: () => void
}) {
  const exhausted = result.seenPercent >= 95

  return (
    <Modal open={open} onClose={onClose} title={exhausted ? 'Content exhausted' : 'Most content already played'}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--foreground-muted)]">
          {exhausted
            ? 'All available content has already been seen by most players in this lobby. Consider uploading your own or picking from the library for a fresher experience.'
            : `${result.seenPercent}% of available content has already been seen by most players. You can still start, or switch to fresh content.`}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose()
              onStartAnyway()
            }}
            className="btn-primary w-full"
          >
            Start anyway
          </button>

          {onUploadCsv ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onUploadCsv()
              }}
              className="btn-secondary w-full"
            >
              Upload your own (CSV)
            </button>
          ) : null}

          {onBrowseLibrary ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onBrowseLibrary()
              }}
              className="btn-secondary w-full"
            >
              Browse Library
            </button>
          ) : null}

          <button type="button" onClick={onClose} className="btn-ghost w-full text-sm">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
