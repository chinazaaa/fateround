'use client'

import { LeaveGameButton, leaveButtonClassName } from '@/components/ui/LeaveGameButton'

export function CodewordsLeaveButton({
  gameCode,
  playerId,
  onLeft,
  className = leaveButtonClassName,
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
