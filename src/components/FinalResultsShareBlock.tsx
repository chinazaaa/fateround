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
  variant = 'default',
  returnToLobbyButton,
  lobbyNote,
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
  /**
   * 'winner' pairs play-again with return-to-lobby side by side and groups the quiet meta
   * actions into one divided row, instead of stacking every action full-width. Defaults to
   * 'default' so existing callers are unchanged.
   */
  variant?: 'default' | 'winner'
  /** 'winner' only — sits beside the play-again button. */
  returnToLobbyButton?: ReactNode
  /** 'winner' only — helper text explaining the two play-again paths. */
  lobbyNote?: ReactNode
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
        variant={variant}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
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
