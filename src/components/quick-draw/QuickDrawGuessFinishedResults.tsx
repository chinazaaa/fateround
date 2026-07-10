'use client'

import type { ReactNode } from 'react'
import { DescribeItFinalResultsShareBlock } from '@/components/describe-it/DescribeItFinalResultsShareBlock'
import { clampQuickDrawNumTeams, clampQuickDrawPlayMode } from '@/lib/quick-draw-guess'
import type { DescribeItWord, Game, Player, QuickDrawGuessWord, QuickDrawPlayMode } from '@/types'

export function QuickDrawGuessFinishedResults({
  game,
  players,
  words,
  playerScores,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  words: QuickDrawGuessWord[]
  playerScores: { player_id: string; score?: number | null }[]
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const mode: QuickDrawPlayMode = clampQuickDrawPlayMode(game.quick_draw_play_mode)
  const numTeams = clampQuickDrawNumTeams(game.quick_draw_num_teams)

  return (
    <DescribeItFinalResultsShareBlock
      game={game}
      players={players}
      words={words as unknown as DescribeItWord[]}
      numTeams={numTeams}
      mode={mode}
      playerScores={playerScores}
      playAgainButton={playAgainButton}
      returnToLobbyButton={returnToLobbyButton}
      lobbyNote={lobbyNote}
    />
  )
}
