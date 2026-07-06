'use client'

import { useRef } from 'react'
import { MEDALS } from '@/lib/medals'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
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
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero game={game} headline={winnerLabel} />
        <div className="space-y-2 pt-2">
          {rows.map((row) => {
            const isWinner = row.rank === 1
            const isMe = row.id === highlightPlayerId
            return (
              <div
                key={row.id}
                className={
                  isWinner
                    ? 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                    : 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--border)] bg-[var(--surface-inset-bg)]'
                }
              >
                <span
                  className={`w-7 shrink-0 text-center font-black tabular-nums ${
                    isWinner ? 'text-lg gradient-title' : 'text-base text-faint'
                  }`}
                >
                  {MEDALS[row.rank - 1] ?? row.rank}
                </span>
                <div className="min-w-0">
                  <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                    {row.name}
                    {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                  </p>
                </div>
                <p
                  className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                    isWinner ? 'gradient-title' : 'text-muted'
                  }`}
                >
                  {row.score} pts
                </p>
              </div>
            )
          })}
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
