'use client'

import { useRef, type ReactNode } from 'react'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { WordHuntPersonalResults } from '@/components/word-hunt/WordHuntPersonalResults'
import type { Game, Player } from '@/types'
import type { WordHuntPlayerScore, WordHuntSubmission } from '@/lib/word-hunt'

export function WordHuntFinalResultsShareBlock({
  game,
  players,
  leaderboard,
  highlightPlayerId,
  mySubmissions,
  validWords,
  playAgainButton,
  showCreateNewGame = true,
}: {
  game: Game
  players: Player[]
  leaderboard: WordHuntPlayerScore[]
  highlightPlayerId?: string | null
  mySubmissions?: Pick<WordHuntSubmission, 'word' | 'points_awarded'>[]
  validWords?: string[]
  playAgainButton?: ReactNode
  showCreateNewGame?: boolean
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const winner = leaderboard[0]
  const winnerLabel = winner ? `${winner.name} wins!` : 'Time\'s up!'

  return (
    <div className="space-y-4">
      {mySubmissions && (
        <WordHuntPersonalResults submissions={mySubmissions} validWords={validWords} />
      )}

      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">{winnerLabel}</p>
        {winner && (
          <p className="text-center text-sm text-muted">
            {winner.points} pts · {winner.word_count} word{winner.word_count === 1 ? '' : 's'}
          </p>
        )}
        <div className="space-y-2 pt-2">
          {leaderboard.map((row, i) => (
            <div
              key={row.player_id}
              className={[
                'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                i === 0
                  ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))]'
                  : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                row.player_id === highlightPlayerId && i !== 0
                  ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]'
                  : '',
              ].join(' ')}
            >
              <p className="font-bold text-sm truncate">
                {i === 0 ? '🏆 ' : `${i + 1}. `}
                {row.name}
                {row.player_id === highlightPlayerId ? ' (you)' : ''}
              </p>
              <p className="text-sm text-muted shrink-0 tabular-nums">
                {row.points} pts · {row.word_count}w
              </p>
            </div>
          ))}
        </div>
      </div>
      <HostGameFinishedActions
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
            wordHuntLeaderboard={leaderboard.map((row) => ({
              name: row.name,
              score: row.points,
              wordCount: row.word_count,
            }))}
            wordHuntWinnerName={winner?.name}
          />
        }
      />
    </div>
  )
}
