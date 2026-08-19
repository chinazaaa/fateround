'use client'

import { useState } from 'react'
import { ShareIcon } from '@/components/rooms/icons'
import { ShareGameModal } from '@/components/host/ShareGameModal'

/**
 * The in-game chrome's Share affordance — opens the same {@link ShareGameModal}
 * share popup the host lobby uses (game code + invite/host tabs + QR + share/copy),
 * so sharing looks identical across the lobby, player lobby, and active play.
 * Replaces the older stacked-section GameShareMenu in the chrome.
 */
export function ShareGameButton({
  gameCode,
  hostToken,
  resumeToken,
  className = '',
}: {
  gameCode: string
  hostToken?: string
  resumeToken?: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share game"
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] text-muted transition-colors hover:text-[var(--foreground)] hover:border-[var(--border-strong)] sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 sm:gap-1.5 sm:text-xs md:text-sm ${className}`}
      >
        <ShareIcon size={17} />
        <span className="hidden sm:inline font-semibold text-body">Share</span>
      </button>
      <ShareGameModal
        open={open}
        onClose={() => setOpen(false)}
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={resumeToken}
      />
    </>
  )
}
