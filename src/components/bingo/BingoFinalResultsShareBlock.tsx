'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

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
      <div ref={captureRef} className="glass-card-strong p-8 sm:p-10 text-center space-y-4">
        <ShareResultsCaptureHeader game={game} />
        {endedEarly ? (
          <>
            <p className="text-5xl sm:text-6xl leading-none pt-2">🏁</p>
            <p className="text-2xl sm:text-3xl font-black text-body">Game ended early</p>
          </>
        ) : (
          <>
            <p className="text-5xl sm:text-6xl leading-none pt-2">🏆</p>
            <p className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-200">BINGO!</p>
            <p className="text-xl sm:text-2xl font-bold text-body">{winnerName} wins!</p>
          </>
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
