'use client'

import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { PlayerResumeCard } from '@/components/PlayerResumeCard'

const leaveInlineClassName =
  'shrink-0 rounded-lg border border-red-500/30 px-3.5 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50'

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
  const leaveButton = (
    <LeaveGameButton
      gameCode={gameCode}
      playerId={playerId}
      onLeft={onLeft}
      label="Leave game"
      confirmTitle={inLobby ? 'Leave this lobby?' : 'Leave this game?'}
      confirmMessage={
        inLobby
          ? 'You can rejoin with your player code if there is room.'
          : 'You can continue later with your player code if the host opens the lobby again.'
      }
      className={leaveInlineClassName}
    />
  )

  if (leaveOnly) {
    return (
      <div className={['flex', align === 'center' ? 'justify-center' : 'justify-end', className].join(' ')}>
        {leaveButton}
      </div>
    )
  }

  return (
    <div className={['space-y-2', className].join(' ')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {onChangeName ? (
            <button type="button" onClick={onChangeName} className="btn-secondary text-sm py-1.5 px-3">
              {changeNameLabel}
            </button>
          ) : (
            <EditNameInline gameCode={gameCode} playerId={playerId} currentName={currentName} onRenamed={onRenamed} />
          )}
        </div>
        {leaveButton}
      </div>
      <PlayerResumeCard gameCode={gameCode} compact={!inLobby} />
    </div>
  )
}
