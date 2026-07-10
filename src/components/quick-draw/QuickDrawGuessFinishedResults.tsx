'use client'

import { useMemo, type ReactNode } from 'react'
import { DescribeItFinalResultsShareBlock } from '@/components/describe-it/DescribeItFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import {
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
  quickDrawGuessIndividualLeaderboard,
} from '@/lib/quick-draw-guess'
import type { DescribeItWord, Game, Player, QuickDrawGuessWord, QuickDrawPlayMode } from '@/types'

export function QuickDrawGuessFinishedResults({
  game,
  players,
  words,
  playerScores,
  highlightPlayerId,
  roundKey,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  words: QuickDrawGuessWord[]
  playerScores: { player_id: string; score?: number | null }[]
  highlightPlayerId?: string | null
  roundKey?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const mode: QuickDrawPlayMode = clampQuickDrawPlayMode(game.quick_draw_play_mode)
  const numTeams = clampQuickDrawNumTeams(game.quick_draw_num_teams)
  const isIndividual = mode === 'individual'

  const leaderboard = useMemo(
    () => (isIndividual ? quickDrawGuessIndividualLeaderboard(playerScores, players) : []),
    [isIndividual, playerScores, players]
  )
  const myRow = highlightPlayerId ? leaderboard.find((row) => row.id === highlightPlayerId) : undefined
  const topScore = leaderboard[0]?.score ?? 0
  const iWon = Boolean(
    isIndividual &&
    myRow &&
    leaderboard[0] != null &&
    myRow.score === topScore &&
    topScore > 0 &&
    leaderboard.length > 1
  )

  return (
    <div className="space-y-4">
      <DescribeItFinalResultsShareBlock
        game={game}
        players={players}
        words={words as unknown as DescribeItWord[]}
        numTeams={numTeams}
        mode={mode}
        playerScores={playerScores}
        highlightPlayerId={highlightPlayerId}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
      />
      {iWon && myRow && (
        <PostWinToCommunity
          gameType="quick_draw"
          gameCode={game.id}
          winnerName={myRow.name}
          roundKey={roundKey ?? game.session_started_at ?? undefined}
        />
      )}
    </div>
  )
}
