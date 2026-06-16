'use client'

import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { playerGameUrl } from '@/lib/site'

type Props = {
  gameCode: string
  className?: string
}

export function ShareGameLinkCard({ gameCode, className = '' }: Props) {
  const url = playerGameUrl(gameCode)

  return (
    <div className={`glass-card p-4 space-y-2 ${className}`}>
      <p className="text-muted text-xs uppercase tracking-wider">Invite friends</p>
      <p className="text-body font-mono text-sm break-all">{url}</p>
      <CopyLinkButton value={url} label="Copy invite link" successMessage="Invite link copied" />
    </div>
  )
}
