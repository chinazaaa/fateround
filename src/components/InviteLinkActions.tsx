'use client'

import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { GameLinkQrButton } from '@/components/GameLinkQrModal'

export function InviteLinkActions({
  url,
  copyLabel = 'Copy link',
  copiedLabel,
  successMessage,
  className = '',
}: {
  url: string
  copyLabel?: string
  copiedLabel?: string
  successMessage?: string
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      <CopyLinkButton
        value={url}
        label={copyLabel}
        copiedLabel={copiedLabel}
        successMessage={successMessage}
      />
      <GameLinkQrButton url={url} label="Show QR code" />
    </div>
  )
}
