'use client'

import { useRef } from 'react'
import type { Game, Player, YahtzeePlayerScore } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { YahtzeeLeaderboard } from '@/components/yahtzee/YahtzeeScorecard'
import type { ReactNode } from 'react'

export function YahtzeeFinalResultsShareBlock({
  game,
  players,
  scores,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  scores: YahtzeePlayerScore[]
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero winnerName={winnerName} game={game} />
        <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={highlightPlayerId} />
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
            yahtzeeScores={scores}
            yahtzeeWinnerName={winnerName ?? undefined}
            primary
          />
        }
      />
    </div>
  )
}
