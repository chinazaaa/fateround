'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Participant, Player, Round, TriviaAnswer, Vote } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { findCardTemplate } from '@/lib/coins/shop-catalog'

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
  cardTemplateSlug,
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
  /**
   * Equipped card-template slug for the game host — the results-share
   * capture inherits the host's template (`docs/coins-and-shop-plan.md`
   * §"Where cosmetics render" → "Card templates"). Falls back to the free
   * default when the slug is unknown or null.
   */
  cardTemplateSlug?: string | null
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const cardTemplate = findCardTemplate(cardTemplateSlug)
  const templateClass = cardTemplate ? cardTemplate.cssClass : ''

  return (
    <>
      <div ref={captureRef} className={`space-y-4 ${templateClass}`}>
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
