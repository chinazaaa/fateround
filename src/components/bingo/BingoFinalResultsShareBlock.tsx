'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

export function BingoFinalResultsShareBlock({
  game,
  players,
  winnerName,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  winnerName?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const endedEarly = !winnerName

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-8 sm:p-10 text-center space-y-5">
        <ShareResultsCaptureHeader game={game} />
        {endedEarly ? (
          <FinishedWinnerHero game={game} emoji="🏁" headline="Game ended early" />
        ) : (
          <FinishedWinnerHero winnerName={winnerName} game={game} subtitle="BINGO!" />
        )}
      </div>
      <HostGameFinishedActions
        gameCode={game.id}
        playAgainButton={playAgainButton}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            bingoWinnerName={winnerName ?? undefined}
            bingoEndedEarly={endedEarly}
          />
        }
      />
    </div>
  )
}
