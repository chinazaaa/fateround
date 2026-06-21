'use client'

import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { PlayerResumeEntry } from '@/components/PlayerResumeEntry'
import { playerGameUrl, shareOrigin } from '@/lib/site'

type Props = {
  gameCode: string
  className?: string
  onResumed?: () => void | Promise<unknown>
  variant?: 'stacked' | 'aside'
}

export function ShareGameLinkCard({
  gameCode,
  className = '',
  onResumed,
  variant = 'stacked',
}: Props) {
  const url = playerGameUrl(gameCode, shareOrigin())
  const handleResumed = onResumed ?? (() => window.location.reload())
  const isAside = variant === 'aside'

  return (
    <div className={`space-y-3 ${className}`}>
      <PlayerInviteCard
        url={url}
        gameCode={gameCode}
        title="Invite friends"
        variant={isAside ? 'aside' : 'default'}
      />
      <PlayerResumeEntry
        gameCode={gameCode}
        onResumed={handleResumed}
        className={isAside ? 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3' : ''}
      />
    </div>
  )
}
