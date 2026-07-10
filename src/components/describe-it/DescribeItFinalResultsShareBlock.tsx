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
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'

export function DescribeItFinalResultsShareBlock({
  game,
  players,
  words,
  numTeams,
  mode = 'team',
  playerScores = [],
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  words: DescribeItWord[]
  numTeams: number
  mode?: DescribeItMode
  playerScores?: { player_id: string; score?: number | null }[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  if (mode === 'individual') {
    return (
      <DescribeItIndividualResults
        captureRef={captureRef}
        game={game}
        players={players}
        playerScores={playerScores}
        highlightPlayerId={highlightPlayerId}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
      />
    )
  }

  const scores = computeDescribeItScores(words, numTeams)
  const winners = describeItWinningTeams(scores)
  const isTie = winners.length > 1
  const winnerHeadline: ReactNode =
    winners.length === 0 ? (
      'No words guessed'
    ) : isTie ? (
      "It's a tie!"
    ) : (
      <>
        <span className="gradient-title">{teamLabel(winners[0]!)}</span> wins!
      </>
    )

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
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero game={game} emoji={winners.length === 0 ? '🏁' : '🏆'} headline={winnerHeadline} />

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
        variant="winner"
        gameCode={game.id}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            primary
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
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  captureRef: React.RefObject<HTMLDivElement | null>
  game: Game
  players: Player[]
  playerScores: { player_id: string; score?: number | null }[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const leaderboard = describeItIndividualLeaderboard(playerScores, players)
  const top = leaderboard[0]?.score ?? 0
  const winners = top > 0 ? leaderboard.filter((p) => p.score === top) : []
  const singleWinnerName = winners.length === 1 ? winners[0]!.name : null
  const winnerHeadline: ReactNode =
    winners.length === 0 ? 'No points scored' : winners.length > 1 ? "It's a tie!" : undefined

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          game={game}
          emoji={winners.length === 0 ? '🏁' : '🏆'}
          winnerName={singleWinnerName}
          headline={winnerHeadline}
        />

        <PaginatedLeaderboard
          title="Final leaderboard"
          rows={leaderboard.map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1 }))}
          highlightId={highlightPlayerId ?? undefined}
          scoreLabel={(score) => `${score} pt${score === 1 ? '' : 's'}`}
          emphasizeLeader
        />
      </div>

      <HostGameFinishedActions
        variant="winner"
        gameCode={game.id}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            primary
          />
        }
      />
    </div>
  )
}
