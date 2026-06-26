'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { tallyCodewordsOperativeStats, tallyCodewordsSpymasterStats, pickBestCodewordsSpymaster } from '@/lib/codewords'
import type { CodewordsGuess, CodewordsPlayerRole, CodewordsTeam, Game, Player } from '@/types'

export function CodewordsFinalResultsShareBlock({
  game,
  players,
  guesses,
  roles,
  winnerLabel,
  subtitle,
  winner,
  highlightPlayerId,
  playAgainButton,
  showCreateNewGame = true,
  showBackHome = true,
}: {
  game: Game
  players: Player[]
  guesses: CodewordsGuess[]
  roles: CodewordsPlayerRole[]
  winnerLabel: string
  subtitle?: string
  winner?: CodewordsTeam | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  showCreateNewGame?: boolean
  showBackHome?: boolean
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const operativeStats = useMemo(() => tallyCodewordsOperativeStats(guesses, roles, players), [guesses, roles, players])
  const spymasterStats = useMemo(() => tallyCodewordsSpymasterStats(guesses, roles, players), [guesses, roles, players])

  const bestOperative = operativeStats[0] ?? null
  const bestSpymaster = useMemo(() => pickBestCodewordsSpymaster(spymasterStats, winner), [spymasterStats, winner])

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">{winnerLabel}</p>
        {subtitle && <p className="text-center text-sm text-muted max-w-sm mx-auto">{subtitle}</p>}

        {(bestOperative || bestSpymaster) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {bestOperative && (
              <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-3 text-center">
                <p className="text-2xl">🎯</p>
                <p className="label-caps text-[10px] mt-1">Best operative</p>
                <p className="font-bold text-sm truncate">{bestOperative.name}</p>
                <p className="text-muted text-xs">{bestOperative.score} pts</p>
              </div>
            )}
            {bestSpymaster && (
              <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-3 text-center">
                <p className="text-2xl">🕵️</p>
                <p className="label-caps text-[10px] mt-1">Best spymaster</p>
                <p className="font-bold text-sm truncate">{bestSpymaster.name}</p>
                <p className="text-muted text-xs">{bestSpymaster.wordsFound} words found</p>
              </div>
            )}
          </div>
        )}

        {operativeStats.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-center text-xs text-muted uppercase tracking-wider">Operative leaderboard</p>
            {operativeStats.slice(0, 6).map((row, index) => {
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
                  className={[
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                    index === 0
                      ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))]'
                      : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                    isMe && index !== 0 ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">
                      {index === 0 ? '🏆 ' : `${index + 1}. `}
                      {row.name}
                      {isMe ? ' (you)' : ''}
                    </p>
                    <p className="text-[11px] text-muted">
                      <CodewordsTeamBadge team={row.team} /> {row.correct} correct
                    </p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-[var(--primary)] shrink-0">{row.score} pts</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <HostGameFinishedActions
        playAgainButton={playAgainButton}
        showCreateNewGame={showCreateNewGame}
        showBackHome={showBackHome}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            codewordsOperativeStats={operativeStats.map((row) => ({ name: row.name, score: row.score }))}
            codewordsWinnerLabel={winnerLabel}
          />
        }
      />
    </div>
  )
}
