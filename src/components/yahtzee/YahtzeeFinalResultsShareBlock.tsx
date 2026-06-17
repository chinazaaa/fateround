'use client'

import { useRef } from 'react'
import type { Game, Player, YahtzeePlayerScore } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { ShareResults } from '@/components/ShareResults'
import { YahtzeeLeaderboard } from '@/components/yahtzee/YahtzeeScorecard'

export function YahtzeeFinalResultsShareBlock({
  game,
  players,
  scores,
  winnerName,
  highlightPlayerId,
}: {
  game: Game
  players: Player[]
  scores: YahtzeePlayerScore[]
  winnerName?: string | null
  highlightPlayerId?: string | null
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const cfg = gameTypeConfig('yahtzee')

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <div className="text-center space-y-2">
          <p className="text-3xl sm:text-4xl leading-none">{cfg.headerEmoji}</p>
          <p className="text-2xl sm:text-3xl font-black gradient-title">{game.title}</p>
          <p className="text-muted text-xs uppercase tracking-wider">Final results</p>
        </div>
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {winnerName ? `${winnerName} wins!` : 'Game over'}
        </p>
        <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={highlightPlayerId} />
      </div>
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
      <CreateNewGameButton />
    </div>
  )
}
