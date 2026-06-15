'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Participant, Player, Round, TriviaAnswer, Vote } from '@/types'
import { parseGameType, gameTypeConfig } from '@/lib/game-types'
import { ShareResults } from '@/components/ShareResults'

/** Wraps final leaderboard UI so Share Results captures a snapshot of what's on screen. */
export function FinalResultsShareBlock({
  children,
  game,
  participants,
  votes,
  rounds,
  players,
  triviaAnswers,
}: {
  children: ReactNode
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const gameType = parseGameType(game.game_type)
  const config = gameTypeConfig(gameType)

  return (
    <>
      <div ref={captureRef} className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-2xl leading-none">{config.headerEmoji}</p>
          <p className="font-bold text-body">{game.title}</p>
          <p className="text-muted text-xs uppercase tracking-wider">Final results</p>
        </div>
        {children}
      </div>
      <ShareResults
        captureRef={captureRef}
        game={game}
        participants={participants}
        votes={votes}
        rounds={rounds}
        players={players}
        triviaAnswers={triviaAnswers}
      />
    </>
  )
}
