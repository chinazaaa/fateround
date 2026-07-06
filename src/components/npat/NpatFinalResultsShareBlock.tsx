'use client'

import { useRef } from 'react'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { npatWinnerLabel } from '@/lib/npat'
import type { Game, Player } from '@/types'
import type { ReactNode } from 'react'

export function NpatFinalResultsShareBlock({
  game,
  players,
  leaderboard,
  highlightPlayerId,
  playAgainButton,
  showCreateNewGame = true,
}: {
  game: Game
  players: Player[]
  leaderboard: { id: string; name: string; score: number }[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  showCreateNewGame?: boolean
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const winnerLabel = npatWinnerLabel(leaderboard)
  const rows = leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">{winnerLabel}</p>
        <div className="space-y-2 pt-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={[
                'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                row.rank === 1
                  ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))]'
                  : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                row.id === highlightPlayerId && row.rank !== 1
                  ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]'
                  : '',
              ].join(' ')}
            >
              <p className="font-bold text-sm truncate">
                {row.rank === 1 ? '🏆 ' : `${row.rank}. `}
                {row.name}
                {row.id === highlightPlayerId ? ' (you)' : ''}
              </p>
              <p className="text-sm text-muted shrink-0">{row.score} pts</p>
            </div>
          ))}
        </div>
      </div>
      <HostGameFinishedActions
        gameCode={game.id}
        playAgainButton={playAgainButton}
        showCreateNewGame={showCreateNewGame}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            npatLeaderboard={leaderboard}
            npatWinnerLabel={winnerLabel}
          />
        }
      />
    </div>
  )
}
