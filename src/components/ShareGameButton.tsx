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
        className={`btn-secondary flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm ${className}`}
      >
        <ShareIcon />
        <span className="hidden sm:inline">Share</span>
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
