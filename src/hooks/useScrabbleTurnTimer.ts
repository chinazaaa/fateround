'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScrabblePlayerState, ScrabbleSession } from '@/types'
import { currentTurnPlayerId } from '@/lib/scrabble-board'
import { secondsUntil } from '@/lib/timer-format'

/**
 * Per-turn countdown for Scrabble. Shows the time left on the current turn and,
 * once the deadline passes, asks the server to auto-pass it. The expire call is
 * idempotent and deadline-gated server-side, so it's safe for any client to fire.
 * No countdown runs when the host left the turn timer off (`turn_deadline_at` null).
 */
export function useScrabbleTurnTimer(session: ScrabbleSession | null) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const firingRef = useRef(false)

  const gameId = session?.game_id ?? null
  const deadline = session?.turn_deadline_at ?? null
  const active = session?.phase === 'playing' && !!deadline

  useEffect(() => {
    if (!active) {
      setSecondsLeft(0)
      return
    }
    const tick = async () => {
      const left = secondsUntil(deadline)
      setSecondsLeft(left)
      if (left <= 0 && deadline && gameId && !firingRef.current) {
        firingRef.current = true
        try {
          await fetch('/api/scrabble/expire-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId }),
          })
        } finally {
          setTimeout(() => (firingRef.current = false), 3000)
        }
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 500)
    return () => window.clearInterval(id)
  }, [active, deadline, gameId])

  return {
    secondsLeft,
    hasTimer: active,
    urgent: active && secondsLeft > 0 && secondsLeft <= 10,
  }
}

/**
 * Chess-clock countdown for Scrabble. Each player has a time bank that only drains
 * while it's their turn; the active seat's clock is derived live from the session's
 * `turn_started_at` + that player's stored `clock_ms_remaining`, so every client ticks
 * in sync without server chatter. When the active bank reaches zero this asks the
 * server to flag the player out (idempotent + authoritatively re-checked server-side,
 * so it's safe for any client to fire). Inert unless the game is in chess-clock mode.
 */
export function useScrabbleChessClock(session: ScrabbleSession | null, playerStates: ScrabblePlayerState[]) {
  const [now, setNow] = useState(() => Date.now())
  const firingRef = useRef(false)

  const gameId = session?.game_id ?? null
  const isChess = session?.clock_mode === 'chess'
  const active = !!isChess && session?.phase === 'playing'
  const startedAt = session?.turn_started_at ? new Date(session.turn_started_at).getTime() : null
  const activePlayerId = session ? currentTurnPlayerId(session) : null

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
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
    if (!active || !gameId || !activePlayerId) return
    const activeState = playerStates.find((s) => s.player_id === activePlayerId)
    if (!activeState || activeState.timed_out) return
    const baseMs = activeState.clock_ms_remaining ?? 0
    const liveMs = startedAt != null ? Math.max(0, baseMs - (now - startedAt)) : baseMs
    if (liveMs <= 0 && !firingRef.current) {
      firingRef.current = true
      void fetch('/api/scrabble/expire-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      }).finally(() => setTimeout(() => (firingRef.current = false), 3000))
    }
  }, [active, gameId, activePlayerId, startedAt, now, playerStates])

  return {
    isChess: !!isChess,
    active,
    clocksByPlayer,
    activeSecondsLeft,
    urgent: active && activeSecondsLeft > 0 && activeSecondsLeft <= 15,
  }
}
