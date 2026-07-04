'use client'

import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { GameLinkQrButton } from '@/components/GameLinkQrModal'
import { ShareInviteButton } from '@/components/ShareInviteButton'

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
      {/* One-tap native share (WhatsApp/Messages on mobile) — the primary invite action;
          copy + QR stay as fallbacks. */}
      <ShareInviteButton url={url} className="text-xs sm:text-sm py-1.5 px-3" />
      <CopyLinkButton value={url} label={copyLabel} copiedLabel={copiedLabel} successMessage={successMessage} />
      <GameLinkQrButton url={url} label="Show QR code" />
    </div>
  )
}
