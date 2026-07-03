'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'

/**
 * Shared, game-agnostic notification hook for the two events every game should
 * announce by default:
 *
 *  - **Host starts the game** — fires when `status` goes `waiting → active`.
 *  - **Your turn** — fires when `isMyTurn` flips to `true` mid-game (only for
 *    turn-based games; omit `isMyTurn` for simultaneous games).
 *
 * Both play `playRoundStartSound()`, which respects the global mute toggle, and
 * (optionally) surface a toast. State is diffed via refs, and the first render
 * only establishes a baseline so nothing fires on mount / mid-game refresh.
 *
 * The turn cue is intentionally suppressed on the same tick the game starts, so
 * the player who moves first hears the "game started" chime rather than two
 * overlapping sounds.
 */
export function useTurnNotifications({
  status,
  isMyTurn = null,
  enabled = true,
  announce = true,
  startMessage = 'Game started! 🎮',
  turnMessage = 'Your turn!',
}: {
  /** The game's lifecycle status (`'waiting' | 'active' | 'finished' | …`). */
  status: string | null | undefined
  /** Whether it is the local player's turn now. Omit for simultaneous games. */
  isMyTurn?: boolean | null
  /** Gate the hook off entirely (e.g. host spectating a game they don't play). */
  enabled?: boolean
  /** Whether to show a toast alongside the sound. */
  announce?: boolean
  startMessage?: string
  turnMessage?: string
}) {
  const { info } = useToast()
  const readyRef = useRef(false)
  const prevStatusRef = useRef<string | null | undefined>(undefined)
  const prevMyTurnRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (!readyRef.current) {
      readyRef.current = true
      prevStatusRef.current = status
      prevMyTurnRef.current = isMyTurn
      return
    }

    const prevStatus = prevStatusRef.current
    const prevMyTurn = prevMyTurnRef.current

    if (prevStatus === 'waiting' && status === 'active') {
      if (announce) info(startMessage)
      void playRoundStartSound()
    } else if (
      status === 'active' &&
      prevStatus === 'active' &&
      isMyTurn === true &&
      prevMyTurn !== true
    ) {
      if (announce) info(turnMessage)
      void playRoundStartSound()
    }

    prevStatusRef.current = status
    prevMyTurnRef.current = isMyTurn
  }, [enabled, status, isMyTurn, announce, startMessage, turnMessage, info])
}
