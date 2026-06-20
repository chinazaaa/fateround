'use client'

import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton, leaveButtonClassName } from '@/components/ui/LeaveGameButton'
import { PlayerResumeCard } from '@/components/PlayerResumeCard'

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
  align = 'start',
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
  align?: 'start' | 'center'
  className?: string
}) {
  return (
    <div
      className={[
        'flex flex-col gap-2',
        align === 'center' ? 'items-center text-center' : '',
        className,
      ].join(' ')}
    >
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
            ? 'You can rejoin with your player code if there is room.'
            : 'You can continue later with your player code if the host opens the lobby again.'
        }
        className={leaveButtonClassName}
      />
      <PlayerResumeCard gameCode={gameCode} compact={!inLobby} />
    </div>
  )
}
