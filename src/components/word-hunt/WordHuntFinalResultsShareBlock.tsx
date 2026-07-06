'use client'

import { useRef, useState, type ReactNode } from 'react'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { WordHuntPersonalResults } from '@/components/word-hunt/WordHuntPersonalResults'
import { WordHuntResultsReview } from '@/components/word-hunt/WordHuntResultsReview'
import type { Game, Player } from '@/types'
import type { WordHuntPlayerScore, WordHuntSubmission } from '@/lib/word-hunt'

const MEDALS = ['👑', '🥈', '🥉']

export function WordHuntFinalResultsShareBlock({
  game,
  players,
  leaderboard,
  highlightPlayerId,
  mySubmissions,
  allSubmissions,
  validWords,
  playAgainButton,
  showCreateNewGame = true,
}: {
  game: Game
  players: Player[]
  leaderboard: WordHuntPlayerScore[]
  highlightPlayerId?: string | null
  mySubmissions?: Pick<WordHuntSubmission, 'word' | 'points_awarded' | 'path'>[]
  allSubmissions?: Pick<WordHuntSubmission, 'word' | 'points_awarded' | 'path' | 'player_id'>[]
  validWords?: string[]
  playAgainButton?: ReactNode
  showCreateNewGame?: boolean
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(
    highlightPlayerId ?? leaderboard[0]?.player_id ?? null
  )
  const winner = leaderboard[0]

  return (
    <div className="space-y-4">
      {allSubmissions && (
        <WordHuntResultsReview
          submissions={allSubmissions}
          leaderboard={leaderboard}
          highlightPlayerId={highlightPlayerId}
          expandedPlayerId={expandedPlayerId}
          onExpandedPlayerChange={setExpandedPlayerId}
        />
      )}

      {mySubmissions && <WordHuntPersonalResults submissions={mySubmissions} validWords={validWords} />}

      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={winner?.name}
          game={game}
          headline={winner ? undefined : "Time's up!"}
          subtitle={
            winner ? `${winner.points} pts · ${winner.word_count} word${winner.word_count === 1 ? '' : 's'}` : undefined
          }
        />
        <div className="space-y-2 pt-2">
          {leaderboard.map((row, i) => {
            const rank = i + 1
            const isWinner = rank === 1
            const isMe = row.player_id === highlightPlayerId
            return (
              <div
                key={row.player_id}
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
                  {MEDALS[rank - 1] ?? rank}
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
                  {row.points} pts · {row.word_count}w
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
