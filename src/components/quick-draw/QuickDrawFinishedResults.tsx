'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { tallyQuickDrawScores } from '@/lib/quick-draw'
import type { QuickDrawDrawing, QuickDrawTitle, QuickDrawVote, Game, Player } from '@/types'

export function QuickDrawFinishedResults({
  game,
  players,
  drawings,
  titles,
  votes = [],
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  drawings: QuickDrawDrawing[]
  titles: QuickDrawTitle[]
  votes?: QuickDrawVote[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const leaderboard = useMemo(
    () => tallyQuickDrawScores(titles, votes, drawings, players),
    [titles, votes, drawings, players]
  )
  const myRow = highlightPlayerId ? leaderboard.find((row) => row.id === highlightPlayerId) : undefined
  const topScore = leaderboard[0]?.score ?? 0
  const iWon = Boolean(
    myRow && leaderboard[0] != null && myRow.score === topScore && topScore > 0 && leaderboard.length > 1
  )
  const winner = leaderboard[0]

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero winnerName={winner?.name} game={game} />
        <PaginatedLeaderboard
          title="Final leaderboard"
          rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
          highlightId={highlightPlayerId ?? undefined}
          scoreLabel={(score) => `${score} pts`}
          emphasizeLeader
        />
      </div>
      {iWon && myRow && (
        <PostWinToCommunity
          gameType="quick_draw"
          gameCode={game.id}
          winnerName={myRow.name}
          roundKey={game.session_started_at ?? undefined}
        />
      )}
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
          />
        }
      />
    </div>
  )
}
