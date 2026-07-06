'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import { CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
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
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero game={game} headline={winnerLabel} subtitle={subtitle} />

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
              const isWinner = index === 0
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
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
                    {MEDALS[index] ?? index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                      {row.name}
                      {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      <CodewordsTeamBadge team={row.team} /> {row.correct} correct
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
        )}
      </div>

      <HostGameFinishedActions
        gameCode={game.id}
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
