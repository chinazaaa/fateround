'use client'

import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'

export function PlayerSessionControls({
  gameCode,
  playerId,
  currentName,
  onRenamed,
  onLeft,
  onChangeName,
  changeNameLabel = 'Change name',
  inLobby = false,
  leaveOnly = false,
  className = '',
}: {
  gameCode: string
  playerId: string
  currentName: string
  onRenamed: (newName: string) => void
  onLeft: () => void
  onChangeName?: () => void
  changeNameLabel?: string
  inLobby?: boolean
  leaveOnly?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {!leaveOnly &&
        (onChangeName ? (
          <button type="button" onClick={onChangeName} className="btn-secondary text-sm py-2.5">
            {changeNameLabel}
          </button>
        ) : (
          <div className="text-center">
            <EditNameInline
              gameCode={gameCode}
              playerId={playerId}
              currentName={currentName}
              onRenamed={onRenamed}
            />
          </div>
        ))}
      <LeaveGameButton
        gameCode={gameCode}
        playerId={playerId}
        onLeft={onLeft}
        confirmTitle={inLobby ? 'Leave this lobby?' : 'Leave this game?'}
        confirmMessage={
          inLobby
            ? 'You can rejoin with the same name if there is room.'
            : 'You can rejoin later if the host opens the lobby again.'
        }
        className="text-faint text-xs hover:text-red-300 transition-colors text-center"
      />
    </div>
  )
}
