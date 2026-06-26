'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChessColor, ChessSession } from '@/types'

export type ChessClockState = {
  whiteMs: number | null
  blackMs: number | null
  timed: boolean
  /** Seconds left for the player on the move (for the turn bar). */
  activeSeconds: number
  urgent: boolean
}

/**
 * Live cumulative chess clocks. The player on the move has their time tick down
 * from `turn_started_at`; the idle player's clock is frozen. When the active
 * clock hits zero, the flag-fall is reported to the server.
 */
export function useChessClocks(gameCode: string, session: ChessSession | null, enabled: boolean): ChessClockState {
  const [, bump] = useState(0)
  const expiringRef = useRef(false)

  const timed = session?.white_time_ms != null && session?.black_time_ms != null
  const status = session?.status ?? null
  const active = session?.current_turn ?? null
  const startedAt = session?.turn_started_at ? Date.parse(session.turn_started_at) : null
  const whiteBase = session?.white_time_ms ?? null
  const blackBase = session?.black_time_ms ?? null

  useEffect(() => {
    if (!timed || !enabled || status !== 'active') return

    const tick = () => {
      bump((n) => n + 1)
      if (active && startedAt != null) {
        const base = active === 'w' ? whiteBase : blackBase
        if (base != null) {
          const ms = Math.max(0, base - Math.max(0, Date.now() - startedAt))
          if (ms <= 0 && !expiringRef.current) {
            expiringRef.current = true
            void fetch('/api/chess/expire-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode }),
            }).finally(() => {
              setTimeout(() => {
                expiringRef.current = false
              }, 3000)
            })
          }
        }
      }
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [timed, enabled, status, active, startedAt, whiteBase, blackBase, gameCode])

  const now = Date.now()
  const live = (color: ChessColor, base: number | null): number | null => {
    if (base == null) return null
    if (status === 'active' && active === color && startedAt != null) {
      return Math.max(0, base - Math.max(0, now - startedAt))
    }
    return base
  }

  const whiteMs = live('w', whiteBase)
  const blackMs = live('b', blackBase)
  const activeMs = active === 'w' ? whiteMs : blackMs

  return {
    whiteMs,
    blackMs,
    timed: !!timed,
    activeSeconds: activeMs != null ? Math.ceil(activeMs / 1000) : 0,
    urgent: !!timed && activeMs != null && activeMs <= 30000 && status === 'active',
  }
}
