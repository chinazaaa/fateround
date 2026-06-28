'use client'

import { SnakeLadderFinalResultsShareBlock } from '@/components/snake-and-ladder/SnakeLadderFinalResultsShareBlock'
import type { Game, Player, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'

function statusLabel(status: Game['status']): string {
  if (status === 'waiting') return 'Waiting to start'
  if (status === 'active') return 'In progress'
  return 'Finished'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function SnakeLadderSessionSummary({
  game,
  players,
  states,
  session,
}: {
  game: Game
  players: Player[]
  states: SnakeLadderPlayerState[]
  session: SnakeLadderSession | null
}) {
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const neverStarted = game.status === 'waiting' || !session

  if (neverStarted) {
    return (
      <div className="space-y-5">
        <div className="glass-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Status</p>
            <p className="font-medium mt-0.5">{statusLabel(game.status)}</p>
          </div>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Created</p>
            <p className="mt-0.5">{formatDate(game.created_at)}</p>
          </div>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Players</p>
            <p className="font-medium mt-0.5">{players.length}</p>
          </div>
        </div>
        <div className="glass-card p-8 text-center text-muted">This Snake &amp; Ladder session never started.</div>
      </div>
    )
  }

  return (
    <SnakeLadderFinalResultsShareBlock
      game={game}
      players={players}
      states={states}
      session={session}
      winnerName={winner?.name}
    />
  )
}
