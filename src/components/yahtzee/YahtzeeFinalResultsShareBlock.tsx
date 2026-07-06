'use client'

import { useRef } from 'react'
import type { Game, Player, YahtzeePlayerScore } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { YahtzeeLeaderboard } from '@/components/yahtzee/YahtzeeScorecard'
import type { ReactNode } from 'react'

export function YahtzeeFinalResultsShareBlock({
  game,
  players,
  scores,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  scores: YahtzeePlayerScore[]
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {winnerName ? `${winnerName} wins!` : 'Game over'}
        </p>
        <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={highlightPlayerId} />
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
            yahtzeeScores={scores}
            yahtzeeWinnerName={winnerName ?? undefined}
          />
        }
      />
    </div>
  )
}
