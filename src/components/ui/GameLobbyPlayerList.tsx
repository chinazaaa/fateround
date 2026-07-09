'use client'

import type { Player } from '@/types'

type LobbyPlayer = Pick<Player, 'id' | 'name' | 'spectator'>

type Props = {
  players: LobbyPlayer[]
  myPlayerId?: string | null
  label?: string
  minPlayers?: number
  maxCapacity?: number | null
  className?: string
  emptyMessage?: string
}

export function GameLobbyPlayerList({
  players,
  myPlayerId,
  label = 'Players joined',
  minPlayers,
  maxCapacity,
  className = '',
  emptyMessage = 'No players yet',
}: Props) {
  const countSuffix =
    maxCapacity != null
      ? ` (${players.length} / ${maxCapacity})`
      : minPlayers != null
        ? ` (${players.length} · need ${minPlayers}+)`
        : ` (${players.length})`

  return (
    <div className={`surface-inset border border-theme rounded-2xl p-4 space-y-2 ${className}`}>
      <p className="text-muted text-xs uppercase tracking-wider">
        {label}
        {countSuffix}
      </p>
      {players.length === 0 ? (
        <p className="text-faint text-xs text-center py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {players.map((player) => {
            const isMe = myPlayerId != null && player.id === myPlayerId
            const notReady = player.spectator === true
            return (
              <div key={player.id} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${notReady ? 'bg-[var(--border-strong)]' : isMe ? 'bg-[var(--primary)]' : 'bg-emerald-500'}`}
                />
                <span
                  className={`text-sm flex-1 min-w-0 truncate ${notReady ? 'text-faint' : isMe ? 'text-[var(--primary)] font-semibold' : 'text-body-muted'}`}
                >
                  <span className="hidden sm:inline">{player.name}</span>
                  <span className="sm:hidden">
                    {player.name.length > 12 ? `${player.name.slice(0, 11)}…` : player.name}
                  </span>
                  {isMe ? ' (you)' : ''}
                  {notReady ? <span className="text-faint text-xs"> · not ready</span> : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
