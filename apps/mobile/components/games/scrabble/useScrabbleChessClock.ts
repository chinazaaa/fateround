import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScrabblePlayerState, ScrabbleSession } from '@fateround/shared'
import { currentTurnPlayerId } from '@fateround/shared/scrabble-board'

/** mm:ss for a remaining time bank (rounds up, never negative). Mirrors web formatScrabbleClock. */
export function formatScrabbleClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Chess-clock countdown for Scrabble (mirrors web useScrabbleChessClock). Each player
 * has a time bank that only drains while it's their turn; the active seat's clock is
 * derived live from the session's `turn_started_at` + that player's stored
 * `clock_ms_remaining`, so every client ticks in sync without server chatter. When the
 * active bank reaches zero this asks the server (via `onExpire`) to flag the player out
 * — idempotent + authoritatively re-checked server-side, so it's safe for any client to
 * fire. Inert unless the game is in chess-clock mode.
 */
export function useScrabbleChessClock(
  session: ScrabbleSession | null,
  playerStates: ScrabblePlayerState[],
  onExpire: () => void
) {
  const [now, setNow] = useState(() => Date.now())
  const firingRef = useRef(false)

  const isChess = session?.clock_mode === 'chess'
  const active = !!isChess && session?.phase === 'playing'
  const startedAt = session?.turn_started_at ? new Date(session.turn_started_at).getTime() : null
  const activePlayerId = session ? currentTurnPlayerId(session) : null

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [active])

  // Live remaining (seconds) per player — the active seat drains from turn_started_at.
  const clocksByPlayer = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of playerStates) {
      const baseMs = s.clock_ms_remaining ?? 0
      const draining = active && s.player_id === activePlayerId && !s.timed_out && startedAt != null
      const ms = draining ? Math.max(0, baseMs - (now - startedAt)) : baseMs
      m.set(s.player_id, ms / 1000)
    }
    return m
  }, [playerStates, active, activePlayerId, startedAt, now])

  const activeSecondsLeft = activePlayerId ? Math.ceil(clocksByPlayer.get(activePlayerId) ?? 0) : 0

  useEffect(() => {
    if (!active || !activePlayerId) return
    const activeState = playerStates.find((s) => s.player_id === activePlayerId)
    if (!activeState || activeState.timed_out) return
    const baseMs = activeState.clock_ms_remaining ?? 0
    const liveMs = startedAt != null ? Math.max(0, baseMs - (now - startedAt)) : baseMs
    if (liveMs <= 0 && !firingRef.current) {
      firingRef.current = true
      Promise.resolve(onExpire()).finally(() => setTimeout(() => (firingRef.current = false), 3000))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activePlayerId, startedAt, now, playerStates])

  return {
    isChess: !!isChess,
    active,
    clocksByPlayer,
    activeSecondsLeft,
    urgent: active && activeSecondsLeft > 0 && activeSecondsLeft <= 15,
  }
}
