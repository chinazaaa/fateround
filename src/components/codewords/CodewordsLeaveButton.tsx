'use client'

import { LeaveGameButton } from '@/components/ui/LeaveGameButton'

export function CodewordsLeaveButton({
  gameCode,
  playerId,
  onLeft,
  className = 'btn-secondary w-full',
}: {
  gameCode: string
  playerId: string
  onLeft: () => void
  className?: string
}) {
  return (
    <LeaveGameButton
      gameCode={gameCode}
      playerId={playerId}
      onLeft={onLeft}
      className={className}
      label="Leave game"
    />
  )
}
