'use client'

import type { Game, Player } from '@/types'
import { anonymousRoomMaxPlayers, countAnonymousRoomPresence } from '@/lib/anonymous-messages'

interface AnonymousRoomHeadcountProps {
  game: Game
  players: Player[]
  className?: string
}

export function AnonymousRoomHeadcount({ game, players, className = '' }: AnonymousRoomHeadcountProps) {
  const inLobby = game.status === 'waiting'
  const capacity = anonymousRoomMaxPlayers(game)
  const { total, participants, viewers } = countAnonymousRoomPresence(players, game)

  return (
    <div className={`glass-card px-4 py-2.5 flex items-center justify-between gap-3 ${className}`}>
      <p className="text-muted text-xs uppercase tracking-wider">{inLobby ? 'In the lobby' : 'In the room'}</p>
      {inLobby ? (
        <span className="text-body text-sm font-semibold tabular-nums">
          {total}
          <span className="text-faint font-normal"> / {capacity}</span>
        </span>
      ) : (
        <div className="text-right text-sm font-semibold tabular-nums leading-snug">
          <p className="text-body">
            {participants} {participants === 1 ? 'player' : 'players'}
            {viewers > 0 && <span className="text-faint font-normal"> · {viewers} viewing</span>}
          </p>
          {viewers > 0 && participants > 0 && (
            <p className="text-faint text-[10px] font-normal mt-0.5">Players can chat · viewers are read-only</p>
          )}
        </div>
      )}
    </div>
  )
}
