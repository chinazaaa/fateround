'use client'

import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import type { Player } from '@/types'

type Props = {
  gameCode: string
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string
  onRenamed: (name: string) => void
  onLeft: () => void
  title?: string
  description?: React.ReactNode
  rulesLink?: React.ReactNode
  activity?: React.ReactNode
  playerListLabel?: string
}

export function GameLobbyWaitingPanel({
  gameCode,
  players,
  myPlayerId,
  myPlayerName,
  onRenamed,
  onLeft,
  title = 'Waiting for host',
  description,
  rulesLink,
  activity,
  playerListLabel = 'In lobby',
}: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-4 py-4 text-center space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">You&apos;re in</p>
        <h2 className="text-xl sm:text-2xl font-black">{title}</h2>
        {description ? <div className="text-muted text-sm leading-relaxed">{description}</div> : null}
      </div>

      {myPlayerId ? (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myPlayerName}
          onRenamed={onRenamed}
          onLeft={onLeft}
          inLobby
        />
      ) : null}

      {rulesLink ? <div className="text-center">{rulesLink}</div> : null}
      <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label={playerListLabel} />
      {activity}
    </div>
  )
}
