'use client'

import { UnoFinalResultsShareBlock } from '@/components/uno/UnoFinalResultsShareBlock'
import type { Game, Player, UnoPlayerHand, UnoSession } from '@/types'

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

export function UnoSessionSummary({
  game,
  players,
  hands,
  session,
}: {
  game: Game
  players: Player[]
  hands: UnoPlayerHand[]
  session: UnoSession | null
}) {
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const neverStarted = game.status === 'waiting' || !session

  // Standings are only meaningful — and only readable — once the game is finished. /api/uno/hands
  // reveals cards to a spectator ONLY for a finished game, so for a game still in progress every
  // `cards` comes back null and buildUnoStandings would rank everyone at 0 cards / 0 points in
  // player-id order. A redacted hand must never be rendered as a real result, so show the game's
  // state instead (the page header already offers "Open game").
  if (neverStarted || game.status !== 'finished') {
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
        <div className="glass-card p-8 text-center text-muted">
          {neverStarted
            ? 'This UNO session never started.'
            : 'This UNO game is still in progress — final standings appear here once it finishes.'}
        </div>
      </div>
    )
  }

  return (
    <UnoFinalResultsShareBlock
      game={game}
      players={players}
      hands={hands}
      session={session}
      winnerName={winner?.name}
    />
  )
}
