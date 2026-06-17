'use client'

import { useState } from 'react'
import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { Modal } from '@/components/ui/Modal'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'

export function GameLinkQrModal({
  open,
  onClose,
  url,
  title = 'Scan to join',
  subtitle = 'Point your camera at the code or share the link below.',
}: {
  open: boolean
  onClose: () => void
  url: string
  title?: string
  subtitle?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} size="md">
      <div className="space-y-4">
        <div className="flex justify-center py-2">
          <GameLinkQrCode url={url} size={200} />
        </div>
        <p className="text-body font-mono text-xs sm:text-sm break-all text-center">{url}</p>
        <div className="flex justify-center">
          <CopyLinkButton value={url} label="Copy invite link" successMessage="Invite link copied" />
        </div>
      </div>
    </Modal>
  )
}

export function GameLinkQrButton({
  url,
  className = '',
  label = 'QR code',
}: {
  url: string
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity ${className}`}
        aria-label="Show join QR code"
      >
        {label}
      </button>
      <GameLinkQrModal open={open} onClose={() => setOpen(false)} url={url} />
    </>
  )
}
