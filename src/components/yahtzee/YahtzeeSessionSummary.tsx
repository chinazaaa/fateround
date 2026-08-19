'use client'

import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import type { Game, Player, YahtzeePlayerScore, YahtzeeSession } from '@/types'

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

export function YahtzeeSessionSummary({
  game,
  players,
  scores,
  session,
}: {
  game: Game
  players: Player[]
  scores: YahtzeePlayerScore[]
  session: YahtzeeSession | null
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
        <div className="glass-card p-8 text-center text-muted">This Five Dice session never started.</div>
      </div>
    )
  }

  return <YahtzeeFinalResultsShareBlock game={game} players={players} scores={scores} winnerName={winner?.name} />
}
