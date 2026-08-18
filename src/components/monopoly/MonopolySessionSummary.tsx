'use client'

import { MonopolyFinalResultsShareBlock } from '@/components/monopoly/MonopolyFinalResultsShareBlock'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

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

export function MonopolySessionSummary({
  game,
  players,
  states,
  board,
}: {
  game: Game
  players: Player[]
  states: MonopolyPlayerState[]
  board: MonopolyBoard | null
}) {
  const winner = players.find((p) => p.id === board?.winner_player_id)
  const neverStarted = game.status === 'waiting' || !board

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
        <div className="glass-card p-8 text-center text-muted">This Estate Kings session never started.</div>
      </div>
    )
  }

  return (
    <MonopolyFinalResultsShareBlock
      game={game}
      players={players}
      states={states}
      board={board}
      winnerName={winner?.name}
    />
  )
}
