'use client'

import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { InviteLinkActions } from '@/components/InviteLinkActions'

export function PlayerInviteCard({
  url,
  title = 'Invite friends',
  gameCode,
  className = '',
  showInlineQr = true,
}: {
  url: string
  title?: string
  gameCode?: string
  className?: string
  showInlineQr?: boolean
}) {
  return (
    <div className={`glass-card p-4 space-y-3 ${className}`}>
      <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
      {gameCode ? <p className="font-mono font-bold text-lg tracking-[0.15em]">{gameCode}</p> : null}
      {showInlineQr ? (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <GameLinkQrCode url={url} />
          <p className="text-faint text-xs">Scan to join</p>
        </div>
      ) : null}
      <p className="text-body font-mono text-sm break-all">{url}</p>
      <InviteLinkActions url={url} copyLabel="Copy invite link" successMessage="Invite link copied" />
    </div>
  )
}
