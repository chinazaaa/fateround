'use client'

import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { playerGameUrl } from '@/lib/site'

type Props = {
  gameCode: string
  className?: string
}

export function ShareGameLinkCard({ gameCode, className = '' }: Props) {
  const url = playerGameUrl(gameCode)

  return (
    <PlayerInviteCard
      url={url}
      gameCode={gameCode}
      title="Invite friends"
      className={className}
    />
  )
}
