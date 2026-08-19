'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound, playRoundEndSound, playVoteSubmittedSound, playGameFinishedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, UnoSession } from '@/types'
import { currentPlayerId } from '@/lib/uno'

export function useUnoNotifications({
  game,
  session,
  myPlayerId,
  myHandCount = 0,
  enabled = true,
  players,
}: {
  game: Game | null
  session: UnoSession | null
  myPlayerId: string | null | undefined
  myHandCount?: number
  enabled?: boolean
  /** Passed in so a High Stakes Mercy knockout can show "<Name> was knocked out"
   *  to the whole room. Optional — without it we skip the name in the toast. */
  players?: Array<{ id: string; name: string }>
}) {
  const { info } = useToast()
  const readyRef = useRef(false)
  const prevTurnIndexRef = useRef<number | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const prevPhaseRef = useRef<string | null>(null)
  const prevHandCountRef = useRef<number | null>(null)
  const prevUnoCallRef = useRef<string | null>(null)
  const prevStatusMessageRef = useRef<string | null>(null)
  // Track eliminated_player_ids across renders so a growth event announces the NEW
  // knockouts (High Stakes Mercy rule — hitting 25 cards is a per-hit event, so we
  // announce each one, and use your own id vs. someone else's for the copy).
  const prevEliminatedRef = useRef<string[]>([])
  // The round whose opening deal we've already accounted for. The initial deal fills your hand
  // (0 → 7, or leftover → 7 on play-again) and must NOT be announced as a draw; only increases
  // AFTER the deal are real draws. Keyed on the session id (recreated each round).
  const dealtRoundRef = useRef<string | null>(null)

  // A player calling "UNO" (either as they play their 2nd-to-last card or via the button)
  // flips uno_called → true for the pending player. Announce it to the whole room once.
  const unoCallKey = session && session.uno_called && session.uno_pending_player ? session.uno_pending_player : null

  useEffect(() => {
    if (!enabled || !game) return

    const activeRoundKey = game.status === 'active' ? (session?.id ?? null) : null

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      prevHandCountRef.current = myHandCount
      prevUnoCallRef.current = unoCallKey
      prevStatusMessageRef.current = session?.status_message ?? null
      // Seed with the current knocked-out list so mounting into a round that already had
      // eliminations doesn't re-announce them.
      prevEliminatedRef.current = (session?.eliminated_player_ids as string[] | null) ?? []
      // Mounting into an already-dealt active round: treat its deal as done so the player's
      // first real draw still notifies (only a fresh 0 → 7 deal should ever be suppressed).
      if (activeRoundKey !== null && myHandCount > 0) dealtRoundRef.current = activeRoundKey
      return
    }

    // Has this round's opening deal already landed? Computed BEFORE we (re)mark it below.
    const dealtThisRound = activeRoundKey !== null && dealtRoundRef.current === activeRoundKey

    if (unoCallKey && unoCallKey !== prevUnoCallRef.current && game.status === 'active') {
      // "UNO" was renamed to "Last card" per the Match Up trademark sweep — mirror that
      // in the toast so the notification matches the button and the status line.
      const msg =
        session?.status_message && session.status_message.includes('Last card')
          ? session.status_message
          : '🎉 Last card called!'
      info(msg)
      playRoundStartSound()
    }
    prevUnoCallRef.current = unoCallKey

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current
    const prevHandCount = prevHandCountRef.current
    const currentTurnIndex = session?.current_turn_index ?? null

    // A 0 (pass all hands) or 7 (swap hands) also changes your hand size, but it isn't a draw —
    // don't mislabel it. The server writes the descriptive status before the hand rows, so it's
    // current here; announce that instead. (Either direction of size change, not just a gain.)
    const statusMsg = session?.status_message ?? ''
    const prevStatusMessage = prevStatusMessageRef.current
    const isZeroSeven = /played a 0|swapped hands with/i.test(statusMsg)
    if (prevHandCount !== null && myHandCount !== prevHandCount && isZeroSeven) {
      info(statusMsg)
      playVoteSubmittedSound()
    } else if (prevHandCount !== null && myHandCount > prevHandCount && dealtThisRound) {
      // Only a genuine draw (after the round's opening deal has settled) — never the deal itself.
      const gained = myHandCount - prevHandCount
      info(`You drew ${gained} card${gained === 1 ? '' : 's'} 🃏`)
      playVoteSubmittedSound()
    }

    // The draw pile auto-reshuffles the discards when it empties; if even that leaves nothing,
    // the turn silently passes with no hand-count change — call both out so no one wonders why
    // a penalty draw (or a plain draw) didn't add any cards.
    if (statusMsg && statusMsg !== prevStatusMessage && game.status === 'active') {
      if (statusMsg.includes('deck reshuffled')) {
        info('🔄 Draw pile empty — discards shuffled back in')
      } else if (statusMsg.includes('draw pile empty')) {
        info('🚫 No cards left to draw — turn passes')
      }
    }

    // Mark this active round's deal accounted-for once the hand is populated, so the very first
    // fill (this render or an earlier one) is never mistaken for a draw on subsequent updates.
    if (activeRoundKey !== null && myHandCount > 0) dealtRoundRef.current = activeRoundKey

    if (prevStatus === 'waiting' && game.status === 'active') {
      info('Game started! 🃏')
      playRoundStartSound()
    }

    if (prevStatus === 'active' && (game.status === 'finished' || session?.phase === 'finished')) {
      playGameFinishedSound()
    }

    if (prevPhase !== 'finished' && session?.phase === 'finished') {
      playGameFinishedSound()
    }

    if (
      session &&
      currentTurnIndex !== null &&
      prevTurnIndex !== null &&
      currentTurnIndex !== prevTurnIndex &&
      game.status === 'active' &&
      session.phase !== 'finished'
    ) {
      const nowMyTurn = myPlayerId && currentPlayerId(session) === myPlayerId
      if (nowMyTurn) {
        info('Your turn! 🃏')
        playRoundStartSound()
      } else {
        playRoundEndSound()
      }
    }

    // High Stakes Mercy — announce every player newly appended to
    // eliminated_player_ids so the whole room sees who just got knocked out. Own-seat
    // knockouts get a personal note; everyone else's is prefixed with their name (if we
    // have the players list) or a generic "A player" fallback.
    const nextEliminated = (session?.eliminated_player_ids as string[] | null) ?? []
    const prevEliminatedSet = new Set(prevEliminatedRef.current)
    const newlyOut = nextEliminated.filter((id) => !prevEliminatedSet.has(id))
    if (newlyOut.length && game.status === 'active') {
      for (const id of newlyOut) {
        if (id === myPlayerId) {
          info('💥 You were knocked out — 25 cards is the Mercy limit')
        } else {
          const name = players?.find((p) => p.id === id)?.name
          info(`💥 ${name ?? 'A player'} was knocked out (25+ cards)`)
        }
      }
      playRoundEndSound()
    }
    prevEliminatedRef.current = nextEliminated

    prevTurnIndexRef.current = currentTurnIndex
    prevStatusRef.current = game.status
    prevPhaseRef.current = session?.phase ?? null
    prevHandCountRef.current = myHandCount
    prevStatusMessageRef.current = statusMsg
  }, [enabled, game, info, myHandCount, myPlayerId, players, session, unoCallKey])
}

export { playVoteSubmittedSound as playUnoActionSound }
