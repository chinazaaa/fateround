'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Participant, Player, Round, TriviaAnswer, Vote } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
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
  showCreateNewGame = true,
  playAgainButton,
}: {
  children: ReactNode
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
  showCreateNewGame?: boolean
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <div ref={captureRef} className="space-y-4">
        <ShareResultsCaptureHeader game={game} />
        {children}
      </div>
      <HostGameFinishedActions
        gameCode={game.id}
        playAgainButton={playAgainButton}
        showCreateNewGame={showCreateNewGame}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={participants}
            votes={votes}
            rounds={rounds}
            players={players}
            triviaAnswers={triviaAnswers}
          />
        }
      />
    </>
  )
}
