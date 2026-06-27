'use client'

import { useRef, type ReactNode } from 'react'
import type { DescribeItMode, DescribeItWord, Game, Player } from '@/types'
import {
  computeDescribeItScores,
  describeItIndividualLeaderboard,
  describeItWinningTeams,
  teamLabel,
} from '@/lib/describe-it'
import { teamStyle, TeamBadge } from '@/components/describe-it/DescribeItChrome'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

export function DescribeItFinalResultsShareBlock({
  game,
  players,
  words,
  numTeams,
  mode = 'team',
  playerScores = [],
  playAgainButton,
}: {
  game: Game
  players: Player[]
  words: DescribeItWord[]
  numTeams: number
  mode?: DescribeItMode
  playerScores?: { player_id: string; score?: number | null }[]
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  if (mode === 'individual') {
    return (
      <DescribeItIndividualResults
        captureRef={captureRef}
        game={game}
        players={players}
        playerScores={playerScores}
        playAgainButton={playAgainButton}
      />
    )
  }

  const scores = computeDescribeItScores(words, numTeams)
  const winners = describeItWinningTeams(scores)
  const isTie = winners.length > 1
  const winnerLabel =
    winners.length === 0 ? 'No words guessed' : isTie ? "It's a tie!" : `${teamLabel(winners[0]!)} wins!`

  // Top guessers across the match (for a fun stat).
  const guessCounts = new Map<string, number>()
  for (const w of words) {
    if (w.status === 'guessed' && w.guesser_player_id) {
      guessCounts.set(w.guesser_player_id, (guessCounts.get(w.guesser_player_id) ?? 0) + 1)
    }
  }
  const topGuessers = [...guessCounts.entries()]
    .map(([id, count]) => ({ name: players.find((p) => p.id === id)?.name ?? 'Player', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{winners.length === 0 ? '🏁' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">{winnerLabel}</p>

        <div className="space-y-2">
          {scores.map((s, i) => {
            const st = teamStyle(s.team)
            const isWinner = winners.includes(s.team)
            return (
              <div
                key={s.team}
                className={[
                  'flex items-center justify-between rounded-xl border px-4 py-2.5',
                  st.chip,
                  isWinner ? `ring-2 ${st.ring}` : '',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <span>{isWinner ? '👑' : `${i + 1}.`}</span>
                  <TeamBadge team={s.team} />
                </span>
                <span className="text-lg font-black tabular-nums">
                  {s.score} {s.score === 1 ? 'word' : 'words'}
                </span>
              </div>
            )
          })}
        </div>

        {topGuessers.length > 0 && (
          <p className="text-center text-xs text-faint">
            Top guesser{topGuessers.length > 1 ? 's' : ''}:{' '}
            {topGuessers.map((g) => `${g.name} (${g.count})`).join(' · ')}
          </p>
        )}
      </div>

      <HostGameFinishedActions
        playAgainButton={playAgainButton}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
          />
        }
      />
    </div>
  )
}

/** Individual-mode final standings: ranked players by total points. */
function DescribeItIndividualResults({
  captureRef,
  game,
  players,
  playerScores,
  playAgainButton,
}: {
  captureRef: React.RefObject<HTMLDivElement | null>
  game: Game
  players: Player[]
  playerScores: { player_id: string; score?: number | null }[]
  playAgainButton?: ReactNode
}) {
  const leaderboard = describeItIndividualLeaderboard(playerScores, players)
  const top = leaderboard[0]?.score ?? 0
  const winners = top > 0 ? leaderboard.filter((p) => p.score === top) : []
  const winnerLabel =
    winners.length === 0 ? 'No points scored' : winners.length > 1 ? "It's a tie!" : `${winners[0]!.name} wins!`

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{winners.length === 0 ? '🏁' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">{winnerLabel}</p>

        <div className="space-y-2">
          {leaderboard.map((p, i) => {
            const isWinner = winners.some((w) => w.id === p.id)
            return (
              <div
                key={p.id}
                className={[
                  'flex items-center justify-between rounded-xl border px-4 py-2.5',
                  isWinner ? 'border-[var(--primary)]/60 bg-[var(--primary)]/10' : 'border-[var(--border-strong)]',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 font-bold min-w-0">
                  <span className="shrink-0">{isWinner ? '👑' : `${i + 1}.`}</span>
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-lg font-black tabular-nums shrink-0">
                  {p.score} {p.score === 1 ? 'pt' : 'pts'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <HostGameFinishedActions
        playAgainButton={playAgainButton}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
          />
        }
      />
    </div>
  )
}
